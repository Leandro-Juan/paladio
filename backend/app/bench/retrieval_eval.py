"""Retrieval & Data Quality Evaluation Harness for Paladio Semantic RAG.

Evaluates retrieval metrics (Recall@10, Recall@50, MRR@10, nDCG@10, Category Entropy@20,
and Spatial Spread@20) against ground-truth judgments across 5 benchmark cities.
Includes semi-automated labeling using local LLM (qwen2.5) with local caching.
"""

import argparse
import json
import logging
import math
import os
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

from app.bench.metrics import calculate_category_entropy

logger = logging.getLogger("retrieval_eval")

BENCH_FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "tests"
    / "fixtures"
    / "retrieval_eval_queries.json"
)
CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "eval_labels"


@dataclass
class EvalMetrics:
    recall_at_10: float = 0.0
    recall_at_50: float = 0.0
    mrr_at_10: float = 0.0
    ndcg_at_10: float = 0.0
    category_entropy_at_20: float = 0.0
    spatial_spread_at_20_km: float = 0.0
    query_count: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two pairs of coordinates in km."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2.0) ** 2
    )
    return 2.0 * r * math.asin(math.sqrt(max(0.0, min(1.0, a))))


def compute_spatial_spread_km(coords: Sequence[tuple[float, float]]) -> float:
    """Computes the median pairwise Haversine distance among candidates."""
    if len(coords) < 2:
        return 0.0
    distances = []
    n = len(coords)
    for i in range(n):
        for j in range(i + 1, n):
            d = haversine_distance_km(
                coords[i][0], coords[i][1], coords[j][0], coords[j][1]
            )
            distances.append(d)
    if not distances:
        return 0.0
    distances.sort()
    mid = len(distances) // 2
    if len(distances) % 2 == 1:
        return distances[mid]
    return (distances[mid - 1] + distances[mid]) / 2.0


def compute_ndcg_at_k(relevance_scores: list[int], k: int = 10) -> float:
    """Computes Normalized Discounted Cumulative Gain at rank K."""
    k_scores = relevance_scores[:k]
    if not k_scores or max(k_scores) == 0:
        return 0.0

    dcg = 0.0
    for idx, rel in enumerate(k_scores):
        if rel > 0:
            dcg += (2.0**rel - 1.0) / math.log2(idx + 2.0)

    ideal_scores = sorted(relevance_scores, reverse=True)[:k]
    idcg = 0.0
    for idx, rel in enumerate(ideal_scores):
        if rel > 0:
            idcg += (2.0**rel - 1.0) / math.log2(idx + 2.0)

    if idcg <= 0.0:
        return 0.0
    return dcg / idcg


def compute_mrr_at_k(
    relevance_scores: list[int], k: int = 10, min_relevant_grade: int = 2
) -> float:
    """Computes Mean Reciprocal Rank at rank K considering grade >= min_relevant_grade."""
    for idx, rel in enumerate(relevance_scores[:k]):
        if rel >= min_relevant_grade:
            return 1.0 / (idx + 1.0)
    return 0.0


def compute_recall_at_k(
    retrieved_ids: list[str], ground_truth_positive_ids: set[str], k: int
) -> float:
    """Computes Recall at rank K against known positive IDs."""
    if not ground_truth_positive_ids:
        return 1.0
    top_k_ids = set(retrieved_ids[:k])
    intersect = top_k_ids.intersection(ground_truth_positive_ids)
    return len(intersect) / len(ground_truth_positive_ids)


class SemiAutomatedLabeler:
    """Labels candidate relevance using local Ollama qwen2.5 and caches results."""

    def __init__(
        self,
        ollama_url: str | None = None,
        model: str = "qwen2.5",
        cache_dir: Path | None = None,
    ):
        self.ollama_url = (
            ollama_url or os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11435")
        ).rstrip("/")
        self.model = model
        self.cache_dir = cache_dir or CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _get_cache_path(self, city: str) -> Path:
        return self.cache_dir / f"{city.lower()}_labels.json"

    def load_cache(self, city: str) -> dict[str, dict[str, int]]:
        p = self._get_cache_path(city)
        if p.exists():
            try:
                with open(p, encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load cache {p}: {e}")
        return {}

    def save_cache(self, city: str, data: dict[str, dict[str, int]]) -> None:
        p = self._get_cache_path(city)
        try:
            with open(p, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"Failed to write cache {p}: {e}")

    async def label_query_candidates(
        self,
        query: str,
        intent: str,
        candidates: list[dict[str, Any]],
        city: str,
        client: httpx.AsyncClient,
    ) -> dict[str, int]:
        """
        Grades candidates on a 0-3 scale:
        0 = irrelevant
        1 = partial match
        2 = highly relevant
        3 = exact / must-see match
        """
        cache = self.load_cache(city)
        if query in cache:
            return cache[query]

        cand_snippets = []
        for c in candidates:
            c_id = c.get("id", "")
            c_name = c.get("name", "")
            c_cat = c.get("category", "")
            c_desc = c.get("description") or c.get("metadata", {}).get(
                "description", ""
            )
            cand_snippets.append(
                {"id": c_id, "name": c_name, "category": c_cat, "text": c_desc[:200]}
            )

        prompt = (
            f"You are evaluating search relevance for a travel POI retrieval system in {city}.\n"
            f"Query: '{query}'\n"
            f"Intent: '{intent}'\n\n"
            f"Candidates:\n{json.dumps(cand_snippets, ensure_ascii=False)}\n\n"
            "Grade each candidate id strictly on this scale:\n"
            "0 = irrelevant or wrong theme/city\n"
            "1 = partially relevant (same general domain but weak match)\n"
            "2 = highly relevant (good match for intent)\n"
            "3 = exact or iconic must-see match\n\n"
            "Output JSON object mapping each candidate id to its integer grade (0, 1, 2, or 3):\n"
            '{"grades": {"id_1": 3, "id_2": 1, ...}}'
        )

        grades: dict[str, int] = {}
        try:
            resp = await client.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False,
                },
                timeout=30.0,
            )
            if resp.status_code == 200:
                payload = json.loads(resp.json().get("response", "{}"))
                raw_grades = payload.get("grades", {})
                for cid, g in raw_grades.items():
                    if isinstance(g, (int, float)):
                        grades[str(cid)] = int(max(0, min(3, g)))
        except Exception as exc:
            logger.debug(f"LLM labeling failed for query '{query}': {exc}")
            for c in candidates:
                cid = c.get("id", "")
                c_name = c.get("name", "").lower()
                q_low = query.lower()
                if q_low in c_name or c_name in q_low:
                    grades[cid] = 3
                elif intent in c.get("category", "").lower():
                    grades[cid] = 2
                else:
                    grades[cid] = 0

        cache[query] = grades
        self.save_cache(city, cache)
        return grades


def evaluate_retrieval_run(
    results_per_query: list[dict[str, Any]],
) -> EvalMetrics:
    """
    results_per_query expects for each item:
    {
        "query": str,
        "retrieved_pois": list of dicts with (id, category, lat, lng, ...)
        "graded_labels": dict mapping id -> grade (0..3)
    }
    """
    if not results_per_query:
        return EvalMetrics()

    rec10_list, rec50_list = [], []
    mrr_list, ndcg_list = [], []
    entropy_list, spread_list = [], []

    for item in results_per_query:
        retrieved = item.get("retrieved_pois", [])
        ret_ids = [p["id"] for p in retrieved if "id" in p]
        graded = item.get("graded_labels", {})

        positives = {cid for cid, g in graded.items() if g >= 2}
        rec10_list.append(compute_recall_at_k(ret_ids, positives, 10))
        rec50_list.append(compute_recall_at_k(ret_ids, positives, 50))

        rel_scores = [graded.get(cid, 0) for cid in ret_ids]
        mrr_list.append(compute_mrr_at_k(rel_scores, 10, min_relevant_grade=2))
        ndcg_list.append(compute_ndcg_at_k(rel_scores, 10))

        top20 = retrieved[:20]
        cats = [p.get("category", "") for p in top20 if p.get("category")]
        entropy_list.append(calculate_category_entropy(cats))

        coords = [
            (float(p["location"]["latitude"]), float(p["location"]["longitude"]))
            for p in top20
            if isinstance(p.get("location"), dict)
            and p["location"].get("latitude") is not None
        ]
        spread_list.append(compute_spatial_spread_km(coords))

    n = len(results_per_query)
    return EvalMetrics(
        recall_at_10=round(sum(rec10_list) / n, 4),
        recall_at_50=round(sum(rec50_list) / n, 4),
        mrr_at_10=round(sum(mrr_list) / n, 4),
        ndcg_at_10=round(sum(ndcg_list) / n, 4),
        category_entropy_at_20=round(sum(entropy_list) / n, 4),
        spatial_spread_at_20_km=round(sum(spread_list) / n, 4),
        query_count=n,
    )


def load_benchmark_queries(city: str | None = None) -> list[dict[str, Any]]:
    if not BENCH_FIXTURE_PATH.exists():
        raise FileNotFoundError(f"Fixture not found at {BENCH_FIXTURE_PATH}")
    with open(BENCH_FIXTURE_PATH, encoding="utf-8") as f:
        data = json.load(f)
    cities_dict = data.get("cities", {})
    if city:
        return cities_dict.get(city.lower(), [])
    all_queries = []
    for c_name, q_list in cities_dict.items():
        for q in q_list:
            q_copy = dict(q)
            q_copy["city"] = c_name
            all_queries.append(q_copy)
    return all_queries


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run retrieval evaluation harness")
    parser.add_argument(
        "--city", type=str, default="madrid", help="Benchmark city name"
    )
    args = parser.parse_args()

    queries = load_benchmark_queries(args.city)
    print(f"Loaded {len(queries)} queries for city '{args.city}'.")
