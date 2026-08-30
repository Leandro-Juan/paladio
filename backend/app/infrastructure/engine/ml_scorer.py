import logging

import jax.numpy as jnp
from app.domain.entities.poi import Poi, ScoredPoi
from app.domain.interfaces.scoring_model import IScoringModel
from app.engine.scoring.features import PoiEncoder, UserStore

logger = logging.getLogger(__name__)


class MLScorer:
    """
    Service responsible for orchestrating ML inference on POIs using JAX.
    It takes raw domain entities, encodes them, performs batch scoring via the model,
    and returns a structured list of ScoredPoi entities.
    """

    def __init__(self, ml_model: IScoringModel, ml_params: dict, user_store: UserStore):
        self.ml_model = ml_model
        self.ml_params = ml_params
        self.user_store = user_store

    def score_pois(
        self, pois: list[Poi], user_id: str = "default_user"
    ) -> list[ScoredPoi]:
        """
        Batches POIs, encodes them, and computes ML scores for a specific user.
        """
        if not pois:
            return []

        poi_embeddings = []
        for poi in pois:
            # PoiEncoder currently expects dict, so we convert the entity for the encoder
            poi_embeddings.append(PoiEncoder.encode(poi.model_dump()))

        poi_embeddings_jnp = jnp.stack(poi_embeddings)
        user_embedding = self.user_store.get_embedding(user_id)

        # Batch inference -> shape (N, 1)
        raw_scores = self.ml_model.batch_score(
            self.ml_params, user_embedding, poi_embeddings_jnp
        )

        scored_pois = []
        for i, poi in enumerate(pois):
            score = float(raw_scores[i][0])
            scored_pois.append(ScoredPoi(poi=poi, score=score))

        return scored_pois
