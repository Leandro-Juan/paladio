import logging
from typing import Any

import numpy as np
from app.adapters.repositories.sql_user_repository import SqlUserRepository
from app.domain.entities.poi import Poi, ScoredPoi
from app.domain.interfaces.embedding_provider import IEmbeddingProvider
from app.domain.interfaces.scoring_model import IScoringModel
from app.engine.scoring.features import PoiEncoder
from app.engine.scoring.semantic_learning import SemanticLearningEngine

logger = logging.getLogger(__name__)


class MLScorer:
    """
    Service responsible for orchestrating ML inference on POIs.
    Supports 768-dimensional dense semantic RAG via Ollama and pgvector,
    permanent EMA user taste learning, and calibrated multi-attribute scoring.
    """

    def __init__(
        self,
        ml_model: IScoringModel,
        ml_params: dict,
        user_repo: SqlUserRepository,
        embedding_provider: IEmbeddingProvider | None = None,
    ):
        self.ml_model = ml_model
        self.ml_params = ml_params
        self.user_repo = user_repo
        self.embedding_provider = embedding_provider
        self.semantic_learning_engine: SemanticLearningEngine | None = None
        self._cached_user_prefs: dict[str, Any] = {}

    async def _get_embedding_provider(self) -> IEmbeddingProvider:
        if self.embedding_provider is None:
            from app.infrastructure.providers.ollama_embedding_provider import (
                OllamaEmbeddingProvider,
            )

            self.embedding_provider = OllamaEmbeddingProvider()
        return self.embedding_provider

    async def _get_semantic_engine(self) -> SemanticLearningEngine:
        if self.semantic_learning_engine is None:
            prov = await self._get_embedding_provider()
            from app.engine.scoring.semantic_learning import CATEGORY_ANCHORS

            anchors: dict[str, list[float]] = {}
            for tag, prompt in CATEGORY_ANCHORS.items():
                try:
                    anchors[tag] = await prov.embed_text(prompt)
                except Exception as e:
                    logger.debug(f"Could not pre-embed anchor for {tag}: {e}")
            self.semantic_learning_engine = SemanticLearningEngine(anchors)
        return self.semantic_learning_engine

    async def score_pois(
        self,
        pois: list[Poi],
        user_id: str = "default_user",
        prompt_affinities: dict[str, float] | None = None,
        prompt_text: str | None = None,
    ) -> list[ScoredPoi]:
        """
        Batches POIs, encodes them, and computes affinity scores for a specific user.
        If prompt_text is provided, generates 768D embedding, blends via permanent EMA,
        persists to PostgreSQL, and updates 8D harmonic telemetry for the UI.
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

        # Check for 768D user embedding in repo
        user_768d: list[float] | None = None
        if hasattr(self.user_repo, "get_embedding"):
            try:
                res = self.user_repo.get_embedding(user_id)
                emb_list = await res if inspect.isawaitable(res) else res
                if emb_list and len(emb_list) == 768:
                    user_768d = emb_list
            except Exception as e:
                logger.debug(f"Could not retrieve 768D user embedding: {e}")

        # Dynamic taste blending & permanent persistence
        if prompt_text and prompt_text.strip():
            prov = await self._get_embedding_provider()
            v_prompt = await prov.embed_text(prompt_text)
            engine = await self._get_semantic_engine()
            v_new = engine.apply_ema_update(user_768d, v_prompt, gamma=0.20)
            user_768d = v_new

            # Update harmonic 8D telemetry in preferences for the UI
            projected = engine.project_to_8d_harmonics(v_new)
            from app.schemas.user import normalize_user_preferences

            norm_pref = normalize_user_preferences(
                user_pref if isinstance(user_pref, dict) else None
            )
            norm_pref.tag_affinities = projected
            updated_pref = norm_pref.model_dump(mode="json")
            user_pref = updated_pref
            self._cached_user_prefs[user_id] = updated_pref

            # Persist 768D vector and preferences to database
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

                if hasattr(self.user_repo, "save_embedding"):
                    try:
                        emb_res = self.user_repo.save_embedding(user_id, v_new)
                        if inspect.isawaitable(emb_res):
                            await emb_res
                        logger.info(
                            f"Permanently updated 768D EMA semantic vector for user {user_id}"
                        )
                    except Exception as e:
                        logger.warning(f"Could not persist updated 768D embedding: {e}")

        elif prompt_affinities:
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

                embedding_vector = [float(w_new[tag]) for tag in TAG_KEYS]

                if hasattr(self.user_repo, "save_embedding"):
                    try:
                        emb_res = self.user_repo.save_embedding(
                            user_id, embedding_vector
                        )
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

        # Calculate semantic affinities if 768D embeddings are present
        semantic_affinities = None
        if user_768d is not None and len(user_768d) == 768:
            poi_sims = []
            has_poi_embeddings = False
            u_norm = SemanticLearningEngine.normalize_vector(user_768d)
            for poi in pois:
                p_emb = getattr(poi, "embedding", None)
                if p_emb and len(p_emb) == 768:
                    has_poi_embeddings = True
                    p_norm = SemanticLearningEngine.normalize_vector(p_emb)
                    sim = float(np.dot(u_norm, p_norm))
                    norm_sim = float(np.clip((sim + 1.0) / 2.0, 0.0, 1.0))
                    poi_sims.append(norm_sim)
                else:
                    poi_sims.append(0.5)

            if has_poi_embeddings:
                semantic_affinities = poi_sims

        score_params = dict(self.ml_params)
        if semantic_affinities is not None:
            score_params["semantic_affinities"] = semantic_affinities

        # Batch inference -> shape (N, 1)
        raw_scores = self.ml_model.batch_score(
            score_params, user_pref, poi_embeddings_np
        )

        scored_pois = []
        for i, poi in enumerate(pois):
            score = float(raw_scores[i][0])
            scored_pois.append(ScoredPoi(poi=poi, score=score))

        return scored_pois
