import logging
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

    async def score_pois(
        self, pois: list[Poi], user_id: str = "default_user"
    ) -> list[ScoredPoi]:
        """
        Batches POIs, encodes them, and computes affinity scores for a specific user.
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

        if user_pref is None:
            logger.info(
                f"MLScorer: Cold-start for user {user_id}. Using balanced neutral preference prior."
            )

        # Batch inference -> shape (N, 1)
        raw_scores = self.ml_model.batch_score(
            self.ml_params, user_pref, poi_embeddings_np
        )

        scored_pois = []
        for i, poi in enumerate(pois):
            score = float(raw_scores[i][0])
            scored_pois.append(ScoredPoi(poi=poi, score=score))

        return scored_pois
