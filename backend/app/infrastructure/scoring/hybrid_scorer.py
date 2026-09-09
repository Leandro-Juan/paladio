import logging
from typing import Any

import numpy as np
from app.domain.interfaces.scoring_model import IScoringModel
from app.engine.scoring.features import TAG_KEYS, PoiEncoder

logger = logging.getLogger(__name__)


class HybridSovereignScorer(IScoringModel):
    """
    Sovereign Hybrid Recommendation Scorer implemented in pure Python & NumPy.
    Replaces the untrained JAX MLP with calibrated, deterministic multi-attribute
    utility scoring, Bayesian rating smoothing, and instant online SGD adaptation.
    """

    def __init__(
        self,
        w_quality: float = 0.35,
        w_affinity: float = 0.40,
        w_pacing: float = 0.15,
        w_budget: float = 0.10,
        prior_reviews_m: float = 50.0,
        prior_rating_C: float = 4.0,
    ):
        self.w_quality = w_quality
        self.w_affinity = w_affinity
        self.w_pacing = w_pacing
        self.w_budget = w_budget
        self.prior_reviews_m = prior_reviews_m
        self.prior_rating_C = prior_rating_C

    def init_params(self, rng_key: Any = None) -> dict[str, Any]:
        """Returns the default model hyper-parameters."""
        return {
            "w_quality": self.w_quality,
            "w_affinity": self.w_affinity,
            "w_pacing": self.w_pacing,
            "w_budget": self.w_budget,
            "prior_reviews_m": self.prior_reviews_m,
            "prior_rating_C": self.prior_rating_C,
            "learning_rate": 0.15,
            "l2_reg": 0.01,
        }

    @staticmethod
    def _extract_tag_weights(user_embedding: Any) -> np.ndarray:
        """
        Extracts an 8D tag affinity weight vector in [0.0, 1.0] from various
        user_embedding representations (e.g. list, ndarray, dict).
        """
        num_tags = len(TAG_KEYS)
        default_weights = np.full(num_tags, 0.5, dtype=np.float32)

        if user_embedding is None:
            return default_weights

        # If passed as dict of preferences or tag_affinities
        if isinstance(user_embedding, dict):
            affinities = user_embedding.get("tag_affinities", user_embedding)
            weights = np.zeros(num_tags, dtype=np.float32)
            for i, tag in enumerate(TAG_KEYS):
                weights[i] = float(affinities.get(tag, 0.5))
            return np.clip(weights, 0.0, 1.0)

        # If passed as list or ndarray
        try:
            arr = np.asarray(user_embedding, dtype=np.float32).flatten()
            if len(arr) == 0:
                return default_weights
            elif len(arr) == num_tags:
                return np.clip(arr, 0.0, 1.0)
            elif len(arr) == PoiEncoder.FEATURE_DIM:
                return np.clip(
                    arr[PoiEncoder.TAG_START_IDX : PoiEncoder.TAG_START_IDX + num_tags],
                    0.0,
                    1.0,
                )
            elif len(arr) >= num_tags:
                # Handle legacy 64D or extended embeddings: take the first 8 elements
                # If they are all 0.1 (legacy cold-start default), boost to neutral 0.5
                extracted = arr[:num_tags]
                if np.allclose(extracted, 0.1, atol=1e-3):
                    return default_weights
                return np.clip(extracted, 0.0, 1.0)
            else:
                weights = np.full(num_tags, 0.5, dtype=np.float32)
                weights[: len(arr)] = arr
                return np.clip(weights, 0.0, 1.0)
        except Exception as e:
            logger.warning(f"Failed to parse user embedding, using neutral prior: {e}")
            return default_weights

    def batch_score(
        self, params: Any, user_embedding: Any, poi_embeddings: Any
    ) -> np.ndarray:
        """
        Computes calibrated scores in [0.0, 100.0] for a batch of POIs.
        poi_embeddings: shape (N, 16) or (N, 128)
        user_embedding: user's taste weights or full user preference dict
        Returns: shape (N, 1) float32 array
        """
        if poi_embeddings is None:
            return np.empty((0, 1), dtype=np.float32)

        P = np.asarray(poi_embeddings, dtype=np.float32)
        if P.ndim == 1:
            P = P.reshape(1, -1)

        n_samples = P.shape[0]
        if n_samples == 0:
            return np.empty((0, 1), dtype=np.float32)

        # Slice to 16D if larger array was provided
        if P.shape[1] > PoiEncoder.FEATURE_DIM:
            P = P[:, : PoiEncoder.FEATURE_DIM]
        elif P.shape[1] < PoiEncoder.FEATURE_DIM:
            # Pad with zeros if smaller
            padded = np.zeros((n_samples, PoiEncoder.FEATURE_DIM), dtype=np.float32)
            padded[:, : P.shape[1]] = P
            P = padded

        user_tag_weights = self._extract_tag_weights(user_embedding)

        # Extract structured user preferences (pace & budget) if available
        user_pace = "balanced"
        user_budget = "balanced"
        if isinstance(user_embedding, dict):
            user_pace = str(user_embedding.get("pace", "balanced")).lower()
            user_budget = str(
                user_embedding.get(
                    "budget_tier", user_embedding.get("budget", "balanced")
                )
            ).lower()
        elif isinstance(params, dict):
            user_pace = str(params.get("pace", "balanced")).lower()
            user_budget = str(
                params.get("budget_tier", params.get("budget", "balanced"))
            ).lower()

        # 1. Bayesian Rating Smoothing
        # Q_p = (v * R + m * C) / (5.0 * (v + m))
        raw_ratings = P[:, 4]
        review_counts = P[:, 5]
        m = (
            float(params.get("prior_reviews_m", self.prior_reviews_m))
            if isinstance(params, dict)
            else self.prior_reviews_m
        )
        C = (
            float(params.get("prior_rating_C", self.prior_rating_C))
            if isinstance(params, dict)
            else self.prior_rating_C
        )

        denom = 5.0 * (review_counts + m)
        denom = np.maximum(denom, 1e-5)
        quality_scores = (review_counts * raw_ratings + m * C) / denom
        quality_scores = np.clip(quality_scores, 0.0, 1.0)

        # 2. Semantic or Tag & Category Affinity
        if (
            isinstance(params, dict)
            and "semantic_affinities" in params
            and params["semantic_affinities"] is not None
        ):
            sem_aff = np.asarray(params["semantic_affinities"], dtype=np.float32)
            if len(sem_aff) == n_samples:
                affinity_scores = np.clip(sem_aff, 0.0, 1.0)
            else:
                affinity_scores = np.full(n_samples, 0.5, dtype=np.float32)
        else:
            tag_matrix = P[
                :, PoiEncoder.TAG_START_IDX : PoiEncoder.TAG_START_IDX + len(TAG_KEYS)
            ]
            tag_sums = np.sum(tag_matrix, axis=1)

            has_tags = tag_sums > 0
            affinity_scores = np.full(n_samples, 0.5, dtype=np.float32)
            if np.any(has_tags):
                dot_products = tag_matrix[has_tags] @ user_tag_weights
                affinity_scores[has_tags] = dot_products / np.maximum(
                    tag_sums[has_tags], 1e-5
                )
            affinity_scores = np.clip(affinity_scores, 0.0, 1.0)

        # 3. Pacing & Duration Fit (Adapts to traveler pace preference)
        durations_norm = P[:, 1]  # duration / 240 mins
        if user_pace in ("leisurely", "relaxed", "slow"):
            # Ideal dwell time ~120 mins (0.50 normalized). Penalize hurried <30 min visits
            pacing_scores = 1.0 - 0.7 * np.abs(durations_norm - 0.50)
            pacing_scores -= 0.25 * (durations_norm < 0.125).astype(np.float32)
        elif user_pace in ("intense", "fast", "packed"):
            # Ideal duration ~45 mins (0.19 normalized). Penalize massive multi-hour time sinks
            pacing_scores = 1.0 - 0.7 * np.abs(durations_norm - 0.19)
            pacing_scores -= 0.25 * (durations_norm > 0.50).astype(np.float32)
        else:
            # Balanced baseline ~60-90 mins (~0.30 normalized)
            pacing_scores = 1.0 - 0.5 * np.abs(durations_norm - 0.30)
        pacing_scores = np.clip(pacing_scores, 0.0, 1.0)

        # 4. Budget Fit (Adapts to traveler budget preference)
        costs_norm = P[:, 0]  # cost / 200 EUR
        is_free = P[:, 6]
        if user_budget in ("budget", "low", "cheap", "budget_friendly"):
            # Heavy penalty for expensive spots; bonus for free spots
            budget_scores = 1.0 - np.clip(costs_norm * 2.2, 0.0, 1.0) + 0.15 * is_free
        elif user_budget in ("luxury", "high", "splurge"):
            # No cost penalty for luxury travelers
            budget_scores = np.ones(n_samples, dtype=np.float32)
        else:
            # Balanced: mild cost sensitivity
            budget_scores = 1.0 - 0.7 * costs_norm
        budget_scores = np.clip(budget_scores, 0.0, 1.0)

        # 5. Composite Multi-Attribute Utility Score
        wq = (
            float(params.get("w_quality", self.w_quality))
            if isinstance(params, dict)
            else self.w_quality
        )
        wa = (
            float(params.get("w_affinity", self.w_affinity))
            if isinstance(params, dict)
            else self.w_affinity
        )
        wp = (
            float(params.get("w_pacing", self.w_pacing))
            if isinstance(params, dict)
            else self.w_pacing
        )
        wb = (
            float(params.get("w_budget", self.w_budget))
            if isinstance(params, dict)
            else self.w_budget
        )

        total_weight = wq + wa + wp + wb
        if total_weight <= 0:
            total_weight = 1.0

        composite = (
            wq * quality_scores
            + wa * affinity_scores
            + wp * pacing_scores
            + wb * budget_scores
        ) / total_weight
        scores = np.clip(composite * 100.0, 0.0, 100.0).astype(np.float32)

        return scores.reshape(-1, 1)

    def update_user(
        self,
        params: Any,
        user_embedding: Any,
        poi_embedding: Any,
        target_score: float,
        learning_rate: float = 0.15,
    ) -> Any:
        """
        Performs an online Stochastic Gradient Descent update on the user's tag affinity weights
        based on explicit user feedback (0.0 to 100.0 scale).
        """
        user_weights = self._extract_tag_weights(user_embedding).copy()

        p = np.asarray(poi_embedding, dtype=np.float32).flatten()
        if len(p) > PoiEncoder.FEATURE_DIM:
            p = p[: PoiEncoder.FEATURE_DIM]
        elif len(p) < PoiEncoder.FEATURE_DIM:
            padded = np.zeros(PoiEncoder.FEATURE_DIM, dtype=np.float32)
            padded[: len(p)] = p
            p = padded

        # Current prediction for this single POI
        current_score = float(
            self.batch_score(params, user_weights, p.reshape(1, -1))[0, 0]
        )
        current_pred = current_score / 100.0
        target = np.clip(float(target_score) / 100.0, 0.0, 1.0)

        error = target - current_pred

        # Activated tags for this POI
        tags = p[PoiEncoder.TAG_START_IDX : PoiEncoder.TAG_START_IDX + len(TAG_KEYS)]
        lr = learning_rate if learning_rate > 0 else 0.15
        l2_reg = 0.01

        # Update each activated tag
        for i in range(len(TAG_KEYS)):
            if tags[i] > 0.0:
                step = lr * (error * tags[i] - l2_reg * (user_weights[i] - 0.5))
                user_weights[i] = np.clip(user_weights[i] + step, 0.0, 1.0)

        # If caller explicitly provided a 64D array, preserve length for legacy compatibility
        if isinstance(user_embedding, (list, np.ndarray)):
            orig_len = len(user_embedding)
            if orig_len == 64:
                out_arr = np.full(64, 0.1, dtype=np.float32)
                out_arr[: len(TAG_KEYS)] = user_weights
                return out_arr.tolist() if isinstance(user_embedding, list) else out_arr
            elif orig_len == 16:
                out_arr = np.zeros(16, dtype=np.float32)
                out_arr[
                    PoiEncoder.TAG_START_IDX : PoiEncoder.TAG_START_IDX + len(TAG_KEYS)
                ] = user_weights
                return out_arr.tolist() if isinstance(user_embedding, list) else out_arr
            elif orig_len == len(TAG_KEYS):
                return (
                    user_weights.tolist()
                    if isinstance(user_embedding, list)
                    else user_weights
                )

        return user_weights.tolist()
