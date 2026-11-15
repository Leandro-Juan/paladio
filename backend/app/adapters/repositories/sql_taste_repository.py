from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.db.models import TasteEventModel, UserModel, UserTasteProfileModel
from app.domain.entities.taste import (
    BehavioralParams,
    BetaPosterior,
    EconomicProfile,
    InferredReason,
    PoiPrior,
    TasteEvent,
    TasteSignalType,
    UserTasteProfile,
)
from app.domain.interfaces.taste_repository import ITasteProfileRepository
from app.engine.scoring.features import TAG_KEYS
from app.schemas.user import normalize_user_preferences

logger = logging.getLogger(__name__)


class SqlTasteRepository(ITasteProfileRepository):
    """SQLAlchemy persistence adapter for user taste profiles and implicit signal events."""

    def __init__(
        self,
        session: AsyncSession | None = None,
        session_factory: Any | None = None,
    ):
        self._session = session
        self._session_factory = session_factory

    @asynccontextmanager
    async def _get_session(self):
        if self._session is not None:
            yield self._session, False
        else:
            factory = self._session_factory
            if factory is None:
                from app.db.session import async_session

                factory = async_session
            async with factory() as sess:
                yield sess, True

    @staticmethod
    def _to_embedding_list(raw_emb: Any) -> list[float] | None:
        if raw_emb is None:
            return None
        try:
            lst = raw_emb.tolist() if hasattr(raw_emb, "tolist") else list(raw_emb)
            return [float(x) for x in lst] if len(lst) == 768 else None
        except Exception:
            return None

    @classmethod
    def _bootstrap_from_user_model(cls, user: UserModel) -> UserTasteProfile:
        """Bootstraps a UserTasteProfile from existing UserModel preferences and embedding."""
        norm_prefs = normalize_user_preferences(user.preferences)
        raw_prefs = user.preferences or {}
        emb = cls._to_embedding_list(user.embedding)

        category_posteriors: dict[str, BetaPosterior] = {}
        has_non_neutral_pref = False
        for tag in TAG_KEYS:
            val = float(norm_prefs.tag_affinities.get(tag, 0.5))
            if abs(val - 0.5) > 0.02:
                has_non_neutral_pref = True
                # Map existing preference value [0, 1] into a mild Beta(6) prior
                total = 6.0
                alpha = max(0.5, min(total - 0.5, val * total))
                category_posteriors[tag] = BetaPosterior(
                    alpha=round(alpha, 4), beta=round(total - alpha, 4)
                )
            else:
                category_posteriors[tag] = BetaPosterior()

        disliked = list(norm_prefs.disliked_tags or [])
        if disliked:
            has_non_neutral_pref = True
            for tag in disliked:
                if tag in category_posteriors:
                    category_posteriors[tag] = BetaPosterior(alpha=1.0, beta=7.0)

        behavioral = BehavioralParams(
            pace=norm_prefs.pace.value,
            crowd_tolerance=float(norm_prefs.crowd_tolerance),
        )
        economic = EconomicProfile(budget_tier=norm_prefs.budget_tier.value)

        is_neutral = (not has_non_neutral_pref) and (
            not raw_prefs.get("tag_affinities")
            or all(
                abs(float(v) - 0.5) <= 0.02 for v in norm_prefs.tag_affinities.values()
            )
        )

        return UserTasteProfile(
            user_id=user.id,
            version=1,
            event_count=0,
            is_neutral=is_neutral,
            embedding=emb,
            category_posteriors=category_posteriors,
            behavioral_params=behavioral,
            economic_profile=economic,
            disliked_tags=disliked,
        )

    @classmethod
    def _model_to_domain(cls, row: UserTasteProfileModel) -> UserTasteProfile:
        cat_posts: dict[str, BetaPosterior] = {}
        for k, v in (row.category_posteriors or {}).items():
            if k == "__cuisines__":
                continue
            if isinstance(v, dict):
                cat_posts[k] = BetaPosterior(**v)
        for tag in TAG_KEYS:
            cat_posts.setdefault(tag, BetaPosterior())

        cuisine_posts: dict[str, BetaPosterior] = {}
        raw_cuisines = (row.category_posteriors or {}).get("__cuisines__", {})
        if isinstance(raw_cuisines, dict):
            for c_key, c_val in raw_cuisines.items():
                if isinstance(c_val, dict):
                    cuisine_posts[c_key] = BetaPosterior(**c_val)

        poi_priors: dict[str, PoiPrior] = {}
        for k, v in (row.poi_priors or {}).items():
            if isinstance(v, dict):
                poi_priors[k] = PoiPrior(**v)

        ctx_profiles: dict[str, dict[str, BetaPosterior]] = {}
        for ctx_key, tag_map in (row.contextual_profiles or {}).items():
            if isinstance(tag_map, dict):
                ctx_profiles[ctx_key] = {
                    t: BetaPosterior(**pv)
                    for t, pv in tag_map.items()
                    if isinstance(pv, dict)
                }

        behavioral_raw = dict(row.behavioral_params or {})
        disliked_tags = list(behavioral_raw.pop("disliked_tags", []) or [])
        behavioral = (
            BehavioralParams(**behavioral_raw) if behavioral_raw else BehavioralParams()
        )
        economic = (
            EconomicProfile(**(row.economic_profile or {}))
            if row.economic_profile
            else EconomicProfile()
        )

        return UserTasteProfile(
            user_id=row.user_id,
            version=row.version or 1,
            event_count=row.event_count or 0,
            is_neutral=(row.event_count or 0) == 0 and not disliked_tags,
            embedding=cls._to_embedding_list(row.embedding),
            category_posteriors=cat_posts,
            cuisine_posteriors=cuisine_posts,
            poi_priors=poi_priors,
            contextual_profiles=ctx_profiles,
            behavioral_params=behavioral,
            economic_profile=economic,
            disliked_tags=disliked_tags,
            ranker_weights=row.ranker_weights,
            last_event_at=row.last_event_at.isoformat() if row.last_event_at else None,
        )

    async def get_profile(self, user_id: str) -> UserTasteProfile | None:
        async with self._get_session() as (session, _):
            res = await session.execute(
                select(UserTasteProfileModel).where(
                    UserTasteProfileModel.user_id == user_id
                )
            )
            row = res.scalar_one_or_none()
            if row is not None:
                return self._model_to_domain(row)

            u_res = await session.execute(
                select(UserModel).where(UserModel.id == user_id)
            )
            user_row = u_res.scalar_one_or_none()
            if user_row is not None:
                return self._bootstrap_from_user_model(user_row)
            return None

    async def get_profiles_for_users(
        self, user_ids: list[str]
    ) -> dict[str, UserTasteProfile]:
        clean_ids = list(dict.fromkeys(uid for uid in user_ids if uid))
        if not clean_ids:
            return {}

        profiles: dict[str, UserTasteProfile] = {}
        async with self._get_session() as (session, _):
            prof_res = await session.execute(
                select(UserTasteProfileModel).where(
                    UserTasteProfileModel.user_id.in_(clean_ids)
                )
            )
            for row in prof_res.scalars().all():
                profiles[row.user_id] = self._model_to_domain(row)

            missing = [uid for uid in clean_ids if uid not in profiles]
            if missing:
                u_res = await session.execute(
                    select(UserModel).where(UserModel.id.in_(missing))
                )
                for u_row in u_res.scalars().all():
                    profiles[u_row.id] = self._bootstrap_from_user_model(u_row)

        return profiles

    async def save_profile(self, profile: UserTasteProfile) -> UserTasteProfile:
        cat_payload: dict[str, Any] = {
            k: v.model_dump(mode="json") for k, v in profile.category_posteriors.items()
        }
        if profile.cuisine_posteriors:
            cat_payload["__cuisines__"] = {
                k: v.model_dump(mode="json")
                for k, v in profile.cuisine_posteriors.items()
            }

        poi_payload = {
            k: v.model_dump(mode="json") for k, v in profile.poi_priors.items()
        }
        ctx_payload = {
            ctx_k: {t: pv.model_dump(mode="json") for t, pv in tag_map.items()}
            for ctx_k, tag_map in profile.contextual_profiles.items()
        }
        behavioral_payload = profile.behavioral_params.model_dump(mode="json")
        behavioral_payload["disliked_tags"] = list(profile.disliked_tags)
        economic_payload = profile.economic_profile.model_dump(mode="json")

        last_ev_dt = None
        if profile.last_event_at:
            try:
                last_ev_dt = datetime.fromisoformat(profile.last_event_at)
            except ValueError:
                last_ev_dt = datetime.now(timezone.utc)

        async with self._get_session() as (session, owns_session):
            res = await session.execute(
                select(UserTasteProfileModel).where(
                    UserTasteProfileModel.user_id == profile.user_id
                )
            )
            row = res.scalar_one_or_none()
            if row is None:
                row = UserTasteProfileModel(
                    user_id=profile.user_id,
                    version=profile.version,
                    event_count=profile.event_count,
                    embedding=profile.embedding,
                    category_posteriors=cat_payload,
                    poi_priors=poi_payload,
                    contextual_profiles=ctx_payload,
                    behavioral_params=behavioral_payload,
                    economic_profile=economic_payload,
                    ranker_weights=profile.ranker_weights,
                    last_event_at=last_ev_dt,
                )
                session.add(row)
            else:
                row.version = profile.version
                row.event_count = profile.event_count
                if profile.embedding is not None:
                    row.embedding = profile.embedding
                row.category_posteriors = cat_payload
                row.poi_priors = poi_payload
                row.contextual_profiles = ctx_payload
                row.behavioral_params = behavioral_payload
                row.economic_profile = economic_payload
                row.ranker_weights = profile.ranker_weights
                row.last_event_at = last_ev_dt
                flag_modified(row, "category_posteriors")
                flag_modified(row, "poi_priors")
                flag_modified(row, "contextual_profiles")
                flag_modified(row, "behavioral_params")
                flag_modified(row, "economic_profile")
                flag_modified(row, "ranker_weights")

            # Keep UserModel embedding and structured preferences synchronized
            u_res = await session.execute(
                select(UserModel).where(UserModel.id == profile.user_id)
            )
            user_row = u_res.scalar_one_or_none()
            if user_row is not None:
                if profile.embedding is not None and len(profile.embedding) == 768:
                    user_row.embedding = profile.embedding
                norm_prefs = normalize_user_preferences(user_row.preferences)
                norm_prefs.tag_affinities = profile.get_tag_affinities()
                norm_prefs.disliked_tags = list(profile.disliked_tags)
                norm_prefs.crowd_tolerance = profile.behavioral_params.crowd_tolerance
                try:
                    from app.schemas.user import BudgetTier, PacePreference

                    norm_prefs.pace = PacePreference(profile.behavioral_params.pace)
                    norm_prefs.budget_tier = BudgetTier(
                        profile.economic_profile.budget_tier
                    )
                except ValueError:
                    pass
                user_row.preferences = norm_prefs.model_dump(mode="json")
                flag_modified(user_row, "preferences")

            if owns_session:
                await session.commit()
            else:
                await session.flush()

        return profile

    async def append_events(self, events: list[TasteEvent]) -> int:
        if not events:
            return 0
        async with self._get_session() as (session, owns_session):
            for ev in events:
                row = TasteEventModel(
                    id=ev.id,
                    user_id=ev.user_id,
                    trip_id=ev.trip_id,
                    entity_type=ev.entity_type,
                    entity_id=ev.entity_id[:256],
                    event_type=ev.event_type.value,
                    polarity=float(ev.polarity),
                    weight=float(ev.weight),
                    inferred_reason=(
                        ev.inferred_reason.value if ev.inferred_reason else None
                    ),
                    context=ev.context,
                    created_at=ev.created_at,
                )
                session.add(row)
            if owns_session:
                await session.commit()
            else:
                await session.flush()
        return len(events)

    async def list_events(self, user_id: str, limit: int = 200) -> list[TasteEvent]:
        async with self._get_session() as (session, _):
            stmt = (
                select(TasteEventModel)
                .where(TasteEventModel.user_id == user_id)
                .order_by(TasteEventModel.created_at.desc())
                .limit(limit)
            )
            res = await session.execute(stmt)
            rows = res.scalars().all()
            out: list[TasteEvent] = []
            for r in rows:
                out.append(
                    TasteEvent(
                        id=r.id,
                        user_id=r.user_id,
                        trip_id=r.trip_id,
                        entity_type=r.entity_type,
                        entity_id=r.entity_id,
                        event_type=TasteSignalType(r.event_type),
                        polarity=r.polarity,
                        weight=r.weight,
                        inferred_reason=(
                            InferredReason(r.inferred_reason)
                            if r.inferred_reason
                            else None
                        ),
                        context=r.context or {},
                        created_at=r.created_at or datetime.now(timezone.utc),
                    )
                )
            return out

    async def delete_profile_and_events(self, user_id: str) -> bool:
        async with self._get_session() as (session, owns_session):
            await session.execute(
                delete(TasteEventModel).where(TasteEventModel.user_id == user_id)
            )
            await session.execute(
                delete(UserTasteProfileModel).where(
                    UserTasteProfileModel.user_id == user_id
                )
            )
            if owns_session:
                await session.commit()
            else:
                await session.flush()
        return True
