import logging
from typing import Any
import numpy as np
from app.domain.entities.poi import Poi, ScoredPoi
from app.domain.interfaces.scoring_model import IScoringModel
from app.engine.scoring.features import PoiEncoder
from app.adapters.repositories.sql_user_repository import SqlUserRepository

logger = logging.getLogger(__name__)


class MLScorer:
    """
    Service responsible for orchestrating ML inference on POIs using pure NumPy.
    It takes raw domain entities, encodes them into deterministic features,
    performs batch scoring via the model, and returns structured ScoredPoi entities.
    """

    def __init__(
        self, ml_model: IScoringModel, ml_params: dict, user_repo: SqlUserRepository
    ):
        self.ml_model = ml_model
        self.ml_params = ml_params
        self.user_repo = user_repo
        self._cached_user_prefs: dict[str, Any] = {}

    async def score_pois(
        self,
        pois: list[Poi],
        user_id: str = "default_user",
        prompt_affinities: dict[str, float] | None = None,
    ) -> list[ScoredPoi]:
        """
        Batches POIs, encodes them, and computes affinity scores for a specific user.
        If prompt_affinities is provided, dynamically blends user tastes and persists them permanently.
        """
        if not pois:
            return []

        poi_embeddings = []
        for poi in pois:
            poi_embeddings.append(PoiEncoder.encode(poi.model_dump()))

        poi_embeddings_np = np.stack(poi_embeddings)

        # Retrieve user preferences or embedding
        user_pref = None
        import inspect

        if hasattr(self.user_repo, "get_by_id"):
            try:
                res = self.user_repo.get_by_id(user_id)
                user_model = await res if inspect.isawaitable(res) else res
                if (
                    user_model
                    and hasattr(user_model, "preferences")
                    and user_model.preferences
                ):
                    user_pref = user_model.preferences
            except Exception as e:
                logger.debug(f"Could not retrieve user preferences: {e}")

        if user_pref is None and hasattr(self.user_repo, "get_embedding"):
            try:
                res = self.user_repo.get_embedding(user_id)
                user_embedding_list = await res if inspect.isawaitable(res) else res
                if user_embedding_list is not None and isinstance(
                    user_embedding_list, (list, np.ndarray)
                ):
                    user_pref = user_embedding_list
            except Exception as e:
                logger.debug(f"Could not retrieve user embedding: {e}")

        if user_pref is None and user_id in self._cached_user_prefs:
            user_pref = self._cached_user_prefs[user_id]

        # Dynamic taste blending & permanent persistence
        if prompt_affinities:
            from app.engine.scoring.features import TAG_KEYS
            from app.schemas.user import normalize_user_preferences

            norm_pref = normalize_user_preferences(
                user_pref if isinstance(user_pref, dict) else None
            )
            w_base = norm_pref.tag_affinities

            alpha = 0.35  # Learning rate for prompt evolution
            w_new = {}
            for tag in TAG_KEYS:
                base_val = float(w_base.get(tag, 0.5))
                if tag in prompt_affinities:
                    p_val = float(np.clip(float(prompt_affinities[tag]), 0.0, 1.0))
                    w_new[tag] = round(
                        float((1.0 - alpha) * base_val + alpha * p_val), 4
                    )
                else:
                    w_new[tag] = round(base_val, 4)

            norm_pref.tag_affinities = w_new
            updated_pref = norm_pref.model_dump(mode="json")
            user_pref = updated_pref
            self._cached_user_prefs[user_id] = updated_pref

            # Persist updated taste permanently to database
            if self.user_repo:
                if hasattr(self.user_repo, "update_preferences"):
                    try:
                        up_res = self.user_repo.update_preferences(
                            user_id, updated_pref
                        )
                        if inspect.isawaitable(up_res):
                            await up_res
                    except Exception as e:
                        logger.warning(
                            f"Could not persist updated user preferences: {e}"
                        )

                embedding_64d = [0.1] * 64
                for idx, tag in enumerate(TAG_KEYS):
                    embedding_64d[idx] = w_new[tag]

                if hasattr(self.user_repo, "save_embedding"):
                    try:
                        emb_res = self.user_repo.save_embedding(user_id, embedding_64d)
                        if inspect.isawaitable(emb_res):
                            await emb_res
                        logger.info(
                            f"Permanently updated and persisted ML taste affinities for user {user_id}"
                        )
                    except Exception as e:
                        logger.warning(f"Could not persist updated user embedding: {e}")

        if user_pref is None:
            logger.info(
                f"MLScorer: Cold-start for user {user_id}. Using balanced neutral preference prior."
            )

        if not self.ml_model:
            # Fallback if no model is loaded
            return [ScoredPoi(poi=poi, score=50.0) for poi in pois]

        # Batch inference -> shape (N, 1)
        raw_scores = self.ml_model.batch_score(
            self.ml_params, user_pref, poi_embeddings_np
        )

        scored_pois = []
        for i, poi in enumerate(pois):
            score = float(raw_scores[i][0])
            scored_pois.append(ScoredPoi(poi=poi, score=score))

        return scored_pois
