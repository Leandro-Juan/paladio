import logging

import numpy as np
from app.engine.scoring.features import TAG_KEYS

logger = logging.getLogger(__name__)

# Canonical semantic anchor prompts for the 8 harmonic categories
CATEGORY_ANCHORS: dict[str, str] = {
    "art_culture": "fine arts museum art gallery cultural exhibitions masterpiece paintings sculptures contemporary art",
    "history_heritage": "ancient historical monuments medieval castles heritage ruins cathedrals archaeology landmarks history",
    "nature_outdoors": "national parks botanical gardens lakes hiking trails nature outdoor scenic green landscapes",
    "architecture": "monumental urban architecture modern facades historic palaces bridges towers city design",
    "food_culinary": "culinary gastronomy restaurants delicious traditional local food dining tapas bistro dishes",
    "nightlife": "vibrant nightlife cocktail bars speakeasy pubs wine lounges evening music entertainment",
    "shopping": "artisan craft markets shopping bazaars designer boutiques local goods antique vintage stores",
    "scenic_views": "scenic panoramic viewpoints mirador observation decks elevated horizon rooftop cityscapes",
}


class SemanticLearningEngine:
    """
    Orchestrates 768D semantic vector learning and permanent EMA evolution.
    Also provides mathematical harmonic projection from the 768D continuous semantic hypersphere
    onto the 8 human-interpretable categories for the frontend Affinity Radar telemetry.
    """

    DEFAULT_GAMMA: float = 0.20  # Exponential Moving Average learning rate

    def __init__(self, anchor_embeddings: dict[str, list[float]] | None = None):
        self._anchors: dict[str, np.ndarray] = {}
        if anchor_embeddings:
            for k, vec in anchor_embeddings.items():
                arr = np.asarray(vec, dtype=np.float32)
                norm = np.linalg.norm(arr)
                if norm > 1e-6:
                    arr /= norm
                self._anchors[k] = arr

    @classmethod
    def normalize_vector(cls, vec: np.ndarray | list[float]) -> np.ndarray:
        """Returns unit L2-normalized vector."""
        arr = np.asarray(vec, dtype=np.float32).flatten()
        norm = np.linalg.norm(arr)
        if norm > 1e-6:
            return arr / norm
        return np.full_like(arr, 1.0 / np.sqrt(len(arr)))

    @classmethod
    def get_neutral_768d_prior(cls, dim: int = 768) -> list[float]:
        """Returns a deterministic normalized neutral prior vector."""
        # Orthogonal unit prior
        arr = np.ones(dim, dtype=np.float32)
        arr /= np.linalg.norm(arr)
        return arr.tolist()

    @classmethod
    def apply_ema_update(
        cls,
        v_history: list[float] | np.ndarray | None,
        v_prompt: list[float] | np.ndarray,
        gamma: float = DEFAULT_GAMMA,
    ) -> list[float]:
        """
        Executes Exponential Moving Average update:
        V_new = (1 - γ) * V_history + γ * V_prompt
        Followed by unit L2 normalization.
        """
        p_arr = cls.normalize_vector(v_prompt)
        dim = len(p_arr)

        if v_history is None or len(v_history) != dim:
            # Cold start: prompt directly initializes taste vector
            return p_arr.tolist()

        h_arr = cls.normalize_vector(v_history)
        blended = (1.0 - gamma) * h_arr + gamma * p_arr
        updated = cls.normalize_vector(blended)
        return updated.tolist()

    def project_to_8d_harmonics(
        self, user_768d: list[float] | np.ndarray
    ) -> dict[str, float]:
        """
        Projects a 768D semantic vector into [0.0, 1.0] affinities across the 8 categories
        by computing cosine similarity against the category anchor vectors.
        """
        u_arr = self.normalize_vector(user_768d)

        projected: dict[str, float] = {}
        for tag in TAG_KEYS:
            if tag in self._anchors:
                anchor_vec = self._anchors[tag]
                # Cosine similarity between normalized vectors is dot product
                cos_sim = float(np.dot(u_arr, anchor_vec))
                # Map typical semantic cosine sim (~0.0 to ~0.7) to calibrated aesthetic range [0.15, 0.95]
                # Formula: normalized_val = clip((cos_sim - 0.05) / 0.65, 0.10, 0.95)
                val = (cos_sim - 0.05) / 0.65
                calibrated = float(np.clip(val, 0.10, 0.95))
                projected[tag] = round(calibrated, 2)
            else:
                projected[tag] = 0.50

        return projected

    def synthesize_768d_from_harmonics(
        self, affinities: dict[str, float], dim: int = 768
    ) -> list[float]:
        """
        Synthesizes a 768D semantic vector from category harmonic affinities.
        Uses anchor vector linear combination if anchors are loaded, or returns
        a normalized harmonic synthesis of dimension 768.
        """
        if self._anchors:
            vec = np.zeros(dim, dtype=np.float32)
            for tag in TAG_KEYS:
                w = float(affinities.get(tag, 0.5))
                if tag in self._anchors:
                    vec += w * self._anchors[tag]
            norm = np.linalg.norm(vec)
            if norm > 1e-6:
                return (vec / norm).tolist()

        chunk_size = dim // len(TAG_KEYS)
        vec = np.zeros(dim, dtype=np.float32)
        for idx, tag in enumerate(TAG_KEYS):
            w = float(affinities.get(tag, 0.5))
            start_idx = idx * chunk_size
            end_idx = start_idx + chunk_size
            vec[start_idx:end_idx] = w
        norm = np.linalg.norm(vec)
        if norm > 1e-6:
            vec /= norm
        return vec.tolist()
