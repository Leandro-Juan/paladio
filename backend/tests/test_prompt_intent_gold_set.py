import json
from pathlib import Path

import pytest
from app.engine.nlp.intent_extractor import PromptIntentExtractor
from app.engine.scoring.features import TAG_KEYS
from app.schemas.rag_schema import RAGPromptAnalysis

GOLD_SET_PATH = Path(__file__).parent / "fixtures" / "prompt_intent_gold_set.json"


def _load_gold_set() -> dict:
    with GOLD_SET_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def test_gold_set_fixture_structure():
    """Verify the 50-prompt Phase 0 baseline fixture is complete and schema-compatible."""
    data = _load_gold_set()
    cases = data["cases"]
    catalog = data["city_catalog"]

    assert len(cases) == 50
    valid_tags = set(TAG_KEYS)

    for case in cases:
        assert case["city"] in catalog, f"Missing city catalog for {case['city']}"
        assert case["prompt"].strip()
        for tag in case.get("expected_top_tags", []):
            assert tag in valid_tags, f"Invalid tag {tag} in {case['id']}"
        for tag in case.get("negated_tags", []):
            assert tag in valid_tags, f"Invalid negated tag {tag} in {case['id']}"
        sample = RAGPromptAnalysis(
            mandatory_pois=case.get("expected_mandatory_pois", []),
            preferred_cuisines=case.get("expected_cuisines", []),
            cuisine_target_frequency=case.get("expected_cuisine_freq", 1),
        )
        assert sample.cuisine_target_frequency >= 1


@pytest.mark.asyncio
async def test_prompt_intent_extractor_gold_set_benchmark():
    """Verify deterministic PromptIntentExtractor meets precision, correlation, and safety thresholds across 50 prompts."""
    data = _load_gold_set()
    cases = data["cases"]
    catalog = data["city_catalog"]

    total_expected_pois = 0
    total_predicted_pois = 0
    true_positive_pois = 0
    forbidden_hits: list[str] = []

    cuisine_matches = 0
    freq_matches = 0
    top_tag_hits = 0
    top_tag_total = 0
    negation_failures: list[str] = []
    facet_matches = 0
    facet_total = 0

    for case in cases:
        city = case["city"]
        res = await PromptIntentExtractor.extract(
            prompt=case["prompt"],
            destination_city=city,
            candidate_pois=catalog[city],
        )

        expected_pois = set(case.get("expected_mandatory_pois", []))
        predicted_pois = set(res.mandatory_pois)
        forbidden = set(case.get("forbidden_mandatory_pois", []))

        total_expected_pois += len(expected_pois)
        total_predicted_pois += len(predicted_pois)
        true_positive_pois += len(expected_pois & predicted_pois)

        bad = predicted_pois & forbidden
        if bad:
            forbidden_hits.append(f"{case['id']}: {sorted(bad)}")

        expected_cuisines = set(case.get("expected_cuisines", []))
        if set(res.preferred_cuisines) == expected_cuisines:
            cuisine_matches += 1

        if res.cuisine_target_frequency == case.get("expected_cuisine_freq", 1):
            freq_matches += 1

        ranked_tags = [
            t
            for t, _ in sorted(
                res.tag_affinities.items(), key=lambda kv: kv[1], reverse=True
            )
        ]
        top_k = set(ranked_tags[:4])
        for exp_tag in case.get("expected_top_tags", []):
            top_tag_total += 1
            if exp_tag in top_k and res.tag_affinities.get(exp_tag, 0.0) >= 0.55:
                top_tag_hits += 1

        for neg_tag in case.get("negated_tags", []):
            if res.tag_affinities.get(neg_tag, 0.0) > 0.25:
                negation_failures.append(
                    f"{case['id']}: {neg_tag}={res.tag_affinities.get(neg_tag)}"
                )

        for fk, fv in case.get("expected_facets", {}).items():
            facet_total += 1
            actual_val = res.required_facets.get(fk)
            if isinstance(fv, list):
                if actual_val and set(fv).issubset(set(actual_val)):
                    facet_matches += 1
            elif actual_val == fv:
                facet_matches += 1

    poi_precision = true_positive_pois / max(1, total_predicted_pois)
    poi_recall = true_positive_pois / max(1, total_expected_pois)
    cuisine_acc = cuisine_matches / len(cases)
    freq_acc = freq_matches / len(cases)
    top_tag_acc = top_tag_hits / max(1, top_tag_total)
    facet_acc = facet_matches / max(1, facet_total)

    assert not forbidden_hits, f"Cross-city/negated POIs leaked: {forbidden_hits}"
    assert not negation_failures, f"Negated tags not dampened: {negation_failures}"
    assert poi_precision >= 0.90, f"POI precision {poi_precision:.2f} < 0.90"
    assert poi_recall >= 0.90, f"POI recall {poi_recall:.2f} < 0.90"
    assert cuisine_acc >= 0.90, f"Cuisine accuracy {cuisine_acc:.2f} < 0.90"
    assert freq_acc >= 0.90, f"Cuisine frequency accuracy {freq_acc:.2f} < 0.90"
    assert top_tag_acc >= 0.85, f"Top tag accuracy {top_tag_acc:.2f} < 0.85"
    assert facet_acc >= 0.85, f"Facet accuracy {facet_acc:.2f} < 0.85"
