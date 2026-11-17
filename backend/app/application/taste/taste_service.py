from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.repositories.sql_taste_repository import SqlTasteRepository
from app.db.models import AttractionModel, TripParticipantModel, UserModel
from app.domain.entities.taste import (
    InferredReason,
    MergedTripTasteProfile,
    TasteEvent,
    TasteSignalType,
    UserTasteProfile,
)
from app.engine.scoring.features import TAG_KEYS
from app.engine.scoring.learned_ranker import TasteRankerModel
from app.engine.scoring.semantic_learning import (
    CATEGORY_ANCHORS,
    SemanticLearningEngine,
)
from app.engine.scoring.taste_engine import (
    ImplicitSignalExtractor,
    TasteProfileUpdater,
    TripTasteAggregator,
)
from app.infrastructure.providers.onnx_embedding_provider import OnnxEmbeddingProvider

logger = logging.getLogger(__name__)


class TasteService:
    """
    Unified backend personalization orchestrator.
    Connects implicit signals, multi-traveler profile aggregation, prompt merging,
    and offline ranker fitting with zero legacy shims.
    """

    _semantic_engine: SemanticLearningEngine | None = None

    @staticmethod
    def is_personalization_enabled() -> bool:
        raw = os.environ.get("PALADIO_TASTE_PERSONALIZATION_ENABLED", "true")
        return raw.strip().lower() not in ("0", "false", "no", "off")

    @classmethod
    async def _get_semantic_engine(cls) -> SemanticLearningEngine:
        if cls._semantic_engine is None:
            provider = OnnxEmbeddingProvider()
            anchors: dict[str, list[float]] = {}
            for tag, prompt in CATEGORY_ANCHORS.items():
                try:
                    anchors[tag] = await provider.embed_text(prompt, input_type="query")
                except Exception as exc:
                    logger.debug("Anchor pre-embed failed for %s: %s", tag, exc)
            cls._semantic_engine = SemanticLearningEngine(anchors)
        return cls._semantic_engine

    @classmethod
    async def get_or_create_profile(
        cls, session: AsyncSession, user_id: str
    ) -> UserTasteProfile:
        repo = SqlTasteRepository(session=session)
        profile = await repo.get_profile(user_id)
        if profile is None:
            profile = UserTasteProfile(
                user_id=user_id,
                embedding=SemanticLearningEngine.get_neutral_768d_prior(),
            )
        elif profile.embedding is None:
            profile.embedding = SemanticLearningEngine.get_neutral_768d_prior()
        return profile

    @classmethod
    async def get_merged_trip_profile(
        cls,
        session: AsyncSession,
        organizer_user_id: str | None = None,
        trip_id: str | None = None,
        participant_specs: list[dict[str, Any]] | None = None,
    ) -> MergedTripTasteProfile:
        if not cls.is_personalization_enabled():
            est_count = max(
                1,
                len(participant_specs or []) + (1 if organizer_user_id else 0),
            )
            return MergedTripTasteProfile(
                traveler_count=est_count,
                active_profile_count=0,
                embedding=SemanticLearningEngine.get_neutral_768d_prior(),
            )
        user_ids: list[str] = []
        if organizer_user_id and organizer_user_id != "default_user":
            user_ids.append(organizer_user_id)

        total_count = 1 if organizer_user_id else 0

        if trip_id:
            try:
                p_res = await session.execute(
                    select(TripParticipantModel).where(
                        TripParticipantModel.trip_id == trip_id
                    )
                )
                db_parts = list(p_res.scalars().all())
                if db_parts:
                    total_count = max(total_count, len(db_parts))
                    for p in db_parts:
                        if p.user_id and p.user_id not in user_ids:
                            user_ids.append(p.user_id)
                        elif not p.user_id and p.email:
                            u_id = (
                                await session.execute(
                                    select(UserModel.id).where(
                                        func.lower(UserModel.email)
                                        == p.email.strip().lower()
                                    )
                                )
                            ).scalar_one_or_none()
                            if u_id and u_id not in user_ids:
                                user_ids.append(u_id)
            except Exception as exc:
                logger.debug(
                    "Could not load participants for trip %s: %s", trip_id, exc
                )

        if participant_specs:
            # Count unique participant slots including specs
            spec_count = len([s for s in participant_specs if isinstance(s, dict)])
            if spec_count > 0:
                has_org_in_specs = any(
                    isinstance(s, dict)
                    and (
                        (organizer_user_id and s.get("user_id") == organizer_user_id)
                        or str(s.get("role") or "").lower() == "organizer"
                    )
                    for s in participant_specs
                )
                total_count = max(
                    total_count,
                    spec_count
                    + (0 if (has_org_in_specs or not organizer_user_id) else 1),
                )
            for spec in participant_specs:
                if not isinstance(spec, dict):
                    continue
                uid = spec.get("user_id")
                email = spec.get("email")
                if uid and uid not in user_ids:
                    user_ids.append(str(uid))
                elif not uid and email:
                    try:
                        u_id = (
                            await session.execute(
                                select(UserModel.id).where(
                                    func.lower(UserModel.email)
                                    == str(email).strip().lower()
                                )
                            )
                        ).scalar_one_or_none()
                        if u_id and u_id not in user_ids:
                            user_ids.append(u_id)
                    except Exception:
                        pass

        repo = SqlTasteRepository(session=session)
        try:
            async with session.begin_nested():
                profiles_map = await repo.get_profiles_for_users(user_ids)
                profiles = list(profiles_map.values())
        except Exception as exc:
            logger.debug("Taste profiles load skipped cleanly: %s", exc)
            profiles = []

        return TripTasteAggregator.merge_profiles(
            profiles=profiles,
            organizer_user_id=organizer_user_id,
            total_participant_count=max(1, total_count, len(profiles)),
        )

    @classmethod
    async def record_events(
        cls,
        session: AsyncSession,
        user_id: str,
        events: list[TasteEvent],
        trip_id: str | None = None,
        attribute_to_all_participants: bool = False,
        commit: bool = True,
    ) -> UserTasteProfile | None:
        if not user_id or user_id == "default_user" or not events:
            return None

        repo = SqlTasteRepository(session=session)
        semantic_engine = await cls._get_semantic_engine()

        profile = await cls.get_or_create_profile(session, user_id)
        await repo.append_events(events)
        profile = TasteProfileUpdater.apply_events(
            profile=profile,
            events=events,
            semantic_engine=semantic_engine,
        )

        if profile.event_count >= 5:
            recent_events = await repo.list_events(user_id, limit=250)
            profile.ranker_weights = TasteRankerModel.fit(recent_events, profile)

        await repo.save_profile(profile)

        # If action had unknown primary actor on a shared trip, update co-travelers at reduced weight
        if attribute_to_all_participants and trip_id:
            p_res = await session.execute(
                select(TripParticipantModel.user_id).where(
                    TripParticipantModel.trip_id == trip_id,
                    TripParticipantModel.user_id.is_not(None),
                )
            )
            co_uids = [uid for uid in p_res.scalars().all() if uid and uid != user_id]
            for co_uid in dict.fromkeys(co_uids):
                scaled = [
                    ev.model_copy(
                        update={"user_id": co_uid, "weight": round(ev.weight * 0.5, 3)}
                    )
                    for ev in events
                ]
                co_prof = await cls.get_or_create_profile(session, co_uid)
                await repo.append_events(scaled)
                co_prof = TasteProfileUpdater.apply_events(
                    profile=co_prof,
                    events=scaled,
                    semantic_engine=semantic_engine,
                )
                await repo.save_profile(co_prof)

        if commit:
            await session.commit()
        return profile

    @classmethod
    async def on_trip_revision(
        cls,
        session: AsyncSession,
        trip_id: str,
        user_id: str | None,
        before_doc: dict[str, Any],
        after_doc: dict[str, Any],
        changes: list[dict[str, Any]] | None = None,
        actor: str = "user",
        attribute_to_all_participants: bool = False,
    ) -> UserTasteProfile | None:
        if not user_id or user_id == "default_user":
            return None
        try:
            events = ImplicitSignalExtractor.extract_from_revision(
                user_id=user_id,
                trip_id=trip_id,
                before_doc=before_doc,
                after_doc=after_doc,
                changes=changes,
                actor=actor,
            )
            if not events:
                return None
            return await cls.record_events(
                session=session,
                user_id=user_id,
                events=events,
                trip_id=trip_id,
                attribute_to_all_participants=attribute_to_all_participants,
            )
        except Exception as exc:
            logger.warning("TasteService.on_trip_revision failed cleanly: %s", exc)
            try:
                await session.rollback()
            except Exception:
                pass
            return None

    @classmethod
    async def on_collection_change(
        cls,
        session: AsyncSession,
        user_id: str | None,
        poi_id: str,
        action: str,
        trip_id: str | None = None,
        poi_metadata: dict[str, Any] | None = None,
    ) -> UserTasteProfile | None:
        if not user_id or user_id == "default_user" or not poi_id:
            return None
        try:
            meta = dict(poi_metadata) if isinstance(poi_metadata, dict) else None
            if meta is None:
                row = (
                    await session.execute(
                        select(AttractionModel).where(AttractionModel.id == poi_id)
                    )
                ).scalar_one_or_none()
                if row is not None:
                    emb = row.embedding
                    if emb is not None and hasattr(emb, "tolist"):
                        emb = emb.tolist()
                    meta = {
                        "name": row.name,
                        "category": row.category,
                        "taxonomy_category": row.taxonomy_category,
                        "description": row.description,
                        "embedding": list(emb) if emb is not None else None,
                    }
            ev = ImplicitSignalExtractor.extract_from_collection(
                user_id=user_id,
                poi_id=poi_id,
                poi_metadata=meta,
                action=action,
                trip_id=trip_id,
            )
            if ev is None:
                return await cls.get_or_create_profile(session, user_id)
            return await cls.record_events(
                session=session,
                user_id=user_id,
                events=[ev],
                trip_id=trip_id,
            )
        except Exception as exc:
            logger.warning("TasteService.on_collection_change failed cleanly: %s", exc)
            try:
                await session.rollback()
            except Exception:
                pass
            return None

    @classmethod
    async def on_ticket_created(
        cls,
        session: AsyncSession,
        user_id: str | None,
        trip_id: str | None,
        ticket: Any,
        attribute_to_all_participants: bool = False,
    ) -> UserTasteProfile | None:
        if not user_id or user_id == "default_user" or ticket is None:
            return None
        try:
            if isinstance(ticket, dict):
                t_dict = ticket
            else:
                t_dict = {
                    "id": getattr(ticket, "id", None),
                    "ticket_type": getattr(ticket, "ticket_type", None),
                    "title": getattr(ticket, "title", None),
                    "provider": getattr(ticket, "provider", None),
                    "location_or_venue": getattr(ticket, "location_or_venue", None),
                    "price": getattr(ticket, "price", None),
                    "start_time": getattr(ticket, "start_time", None),
                    "ticket_metadata": getattr(ticket, "ticket_metadata", None) or {},
                }
            events = ImplicitSignalExtractor.extract_from_ticket(
                user_id=user_id,
                trip_id=trip_id,
                ticket=t_dict,
            )
            if not events:
                return None
            return await cls.record_events(
                session=session,
                user_id=user_id,
                events=events,
                trip_id=trip_id,
                attribute_to_all_participants=attribute_to_all_participants,
            )
        except Exception as exc:
            logger.warning("TasteService.on_ticket_created failed cleanly: %s", exc)
            try:
                await session.rollback()
            except Exception:
                pass
            return None

    @classmethod
    async def on_deal_feedback(
        cls,
        session: AsyncSession,
        user_id: str | None,
        deal: Any,
        feedback: str,
        trip_id: str | None = None,
        attribute_to_all_participants: bool = False,
    ) -> UserTasteProfile | None:
        if not user_id or user_id == "default_user" or deal is None:
            return None
        try:
            if isinstance(deal, dict):
                d_dict = deal
            else:
                d_dict = {
                    "id": getattr(deal, "id", None),
                    "package_json": getattr(deal, "package_json", None) or {},
                    "total_price_cents": getattr(deal, "total_price_cents", 0) or 0,
                }
            ev = ImplicitSignalExtractor.extract_from_deal(
                user_id=user_id,
                deal_dict=d_dict,
                feedback=feedback,
            )
            return await cls.record_events(
                session=session,
                user_id=user_id,
                events=[ev],
                trip_id=trip_id,
                attribute_to_all_participants=attribute_to_all_participants,
            )
        except Exception as exc:
            logger.warning("TasteService.on_deal_feedback failed cleanly: %s", exc)
            try:
                await session.rollback()
            except Exception:
                pass
            return None

    @classmethod
    async def on_prompt_analyzed(
        cls,
        session: AsyncSession,
        user_id: str | None,
        prompt_text: str,
        analysis_dict: dict[str, Any] | None = None,
        trip_id: str | None = None,
    ) -> UserTasteProfile | None:
        if (
            not user_id
            or user_id == "default_user"
            or not prompt_text
            or not prompt_text.strip()
        ):
            return None
        try:
            provider = OnnxEmbeddingProvider()
            v_prompt = await provider.embed_text(
                prompt_text.strip(), input_type="query"
            )
            events: list[TasteEvent] = [
                TasteEvent(
                    user_id=user_id,
                    trip_id=trip_id,
                    entity_type="prompt",
                    entity_id=prompt_text.strip()[:120],
                    event_type=TasteSignalType.PROMPT_ANALYZED,
                    polarity=0.50,
                    weight=0.40,
                    inferred_reason=InferredReason.TASTE_MATCH,
                    context={"embedding": v_prompt, "affect_category": False},
                )
            ]
            tag_affs = (analysis_dict or {}).get("tag_affinities") or {}
            for tag, val in tag_affs.items():
                if tag not in TAG_KEYS:
                    continue
                fval = float(val)
                if fval >= 0.65:
                    events.append(
                        TasteEvent(
                            user_id=user_id,
                            trip_id=trip_id,
                            entity_type="category",
                            entity_id=tag,
                            event_type=TasteSignalType.PROMPT_ANALYZED,
                            polarity=min(0.8, fval),
                            weight=0.35,
                            inferred_reason=InferredReason.TASTE_MATCH,
                            context={"category": tag},
                        )
                    )
                elif fval <= 0.15:
                    events.append(
                        TasteEvent(
                            user_id=user_id,
                            trip_id=trip_id,
                            entity_type="category",
                            entity_id=tag,
                            event_type=TasteSignalType.PROMPT_ANALYZED,
                            polarity=-0.6,
                            weight=0.45,
                            inferred_reason=InferredReason.TASTE_DISLIKE,
                            context={"category": tag},
                        )
                    )
            return await cls.record_events(
                session=session,
                user_id=user_id,
                events=events,
                trip_id=trip_id,
            )
        except Exception as exc:
            logger.warning("TasteService.on_prompt_analyzed failed cleanly: %s", exc)
            try:
                await session.rollback()
            except Exception:
                pass
            return None

    @classmethod
    async def on_chat_preference(
        cls,
        session: AsyncSession,
        user_id: str | None,
        trip_id: str | None,
        target: str,
        target_type: str,
        polarity: float,
        hard_veto: bool = False,
    ) -> UserTasteProfile | None:
        if not user_id or user_id == "default_user" or not target:
            return None
        ev = ImplicitSignalExtractor.extract_from_chat(
            user_id=user_id,
            trip_id=trip_id,
            target=target,
            target_type=target_type,
            polarity=polarity,
            hard_veto=hard_veto,
        )
        return await cls.record_events(
            session=session,
            user_id=user_id,
            events=[ev],
            trip_id=trip_id,
        )

    @classmethod
    async def export_user_taste_data(
        cls, session: AsyncSession, user_id: str
    ) -> dict[str, Any]:
        repo = SqlTasteRepository(session=session)
        profile = await cls.get_or_create_profile(session, user_id)
        events = await repo.list_events(user_id, limit=200)
        return {
            "user_id": user_id,
            "profile": profile.model_dump(mode="json", exclude={"embedding"}),
            "embedding_dimension": len(profile.embedding) if profile.embedding else 0,
            "tag_affinities": profile.get_tag_affinities(),
            "tag_uncertainties": profile.get_tag_uncertainties(),
            "recent_events": [
                ev.model_dump(mode="json", exclude={"context": {"embedding"}})
                for ev in events
            ],
            "exported_at": datetime.now(timezone.utc).isoformat(),
        }

    @classmethod
    async def reset_user_taste_profile(
        cls, session: AsyncSession, user_id: str
    ) -> UserTasteProfile:
        repo = SqlTasteRepository(session=session)
        await repo.delete_profile_and_events(user_id)
        neutral = UserTasteProfile(
            user_id=user_id,
            version=1,
            event_count=0,
            is_neutral=True,
            embedding=SemanticLearningEngine.get_neutral_768d_prior(),
        )
        await repo.save_profile(neutral)
        await session.commit()
        return neutral

    @classmethod
    async def delete_user_taste_data(cls, session: AsyncSession, user_id: str) -> bool:
        repo = SqlTasteRepository(session=session)
        await repo.delete_profile_and_events(user_id)
        u_res = await session.execute(select(UserModel).where(UserModel.id == user_id))
        user_row = u_res.scalar_one_or_none()
        if user_row is not None:
            from app.schemas.user import (
                DEFAULT_TAG_AFFINITIES,
                normalize_user_preferences,
            )
            from sqlalchemy.orm.attributes import flag_modified

            user_row.embedding = SemanticLearningEngine.get_neutral_768d_prior()
            norm_prefs = normalize_user_preferences(user_row.preferences)
            norm_prefs.tag_affinities = dict(DEFAULT_TAG_AFFINITIES)
            norm_prefs.disliked_tags = []
            user_row.preferences = norm_prefs.model_dump(mode="json")
            flag_modified(user_row, "preferences")
        await session.commit()
        return True

    @classmethod
    async def forget_user_preference(
        cls,
        session: AsyncSession,
        user_id: str,
        target: str,
    ) -> UserTasteProfile:
        from app.domain.entities.taste import BetaPosterior

        key = (target or "").strip().lower()
        repo = SqlTasteRepository(session=session)
        profile = await cls.get_or_create_profile(session, user_id)
        if key:
            profile.disliked_tags = [
                t for t in profile.disliked_tags if t.strip().lower() != key
            ]
            for pk in [
                k for k in list(profile.poi_priors.keys()) if key in k.strip().lower()
            ]:
                profile.poi_priors.pop(pk, None)
            if key in profile.category_posteriors:
                profile.category_posteriors[key] = BetaPosterior()
            if key in profile.cuisine_posteriors:
                profile.cuisine_posteriors[key] = BetaPosterior()
            lp = profile.economic_profile.lodging_preferences
            if isinstance(lp, dict) and isinstance(lp.get("preferred_types"), dict):
                lp["preferred_types"].pop(key, None)
            for ctx_map in profile.contextual_profiles.values():
                ctx_map.pop(key, None)
            profile.version += 1
        await repo.save_profile(profile)
        await session.commit()
        return profile

    @classmethod
    async def sync_from_user_preferences(
        cls,
        session: AsyncSession,
        user_id: str,
        preferences: dict[str, Any] | None,
    ) -> UserTasteProfile:
        from app.domain.entities.taste import BetaPosterior
        from app.schemas.user import normalize_user_preferences

        repo = SqlTasteRepository(session=session)
        profile = await cls.get_or_create_profile(session, user_id)
        norm = normalize_user_preferences(preferences)
        for tag in TAG_KEYS:
            val = float(norm.tag_affinities.get(tag, 0.5))
            if abs(val - 0.5) > 0.02:
                total = 6.0
                profile.category_posteriors[tag] = BetaPosterior(
                    alpha=max(0.5, round(val * total, 3)),
                    beta=max(0.5, round((1.0 - val) * total, 3)),
                )
        profile.disliked_tags = list(
            dict.fromkeys([t.strip().lower() for t in norm.disliked_tags if t])
        )
        for cuis in norm.preferred_cuisines:
            c = str(cuis).strip().lower()
            if c:
                profile.cuisine_posteriors[c] = BetaPosterior(alpha=5.0, beta=1.5)
        profile.behavioral_params.pace = norm.pace.value
        profile.behavioral_params.walking_tolerance = norm.walking_tolerance.value
        profile.economic_profile.budget_tier = norm.budget_tier.value
        profile.is_neutral = False
        profile.version += 1
        await repo.save_profile(profile)
        await session.commit()
        return profile

    @classmethod
    async def sync_from_user_embedding(
        cls,
        session: AsyncSession,
        user_id: str,
        embedding: list[float],
    ) -> UserTasteProfile:
        repo = SqlTasteRepository(session=session)
        profile = await cls.get_or_create_profile(session, user_id)
        if isinstance(embedding, list) and len(embedding) == 768:
            profile.embedding = SemanticLearningEngine.normalize_vector(
                embedding
            ).tolist()
            profile.is_neutral = False
            profile.version += 1
            await repo.save_profile(profile)
            await session.commit()
        return profile

    @classmethod
    async def retrain_active_profiles(
        cls,
        session: AsyncSession,
        max_users: int = 100,
    ) -> dict[str, int]:
        from app.db.models import TasteEventModel, TripModel, UserTasteProfileModel

        today_iso = datetime.now(timezone.utc).date().isoformat()
        kept_trips_processed = 0
        kept_events_recorded = 0

        already_res = await session.execute(
            select(TasteEventModel.trip_id)
            .where(
                TasteEventModel.event_type == TasteSignalType.STOP_KEPT.value,
                TasteEventModel.trip_id.is_not(None),
            )
            .distinct()
        )
        processed_trip_ids = {r[0] for r in already_res.all() if r[0]}

        trip_filters = [
            TripModel.status == "active",
            func.substr(TripModel.end_date, 1, 10) < today_iso,
            TripModel.user_id.is_not(None),
        ]
        if processed_trip_ids:
            trip_filters.append(TripModel.id.not_in(processed_trip_ids))

        trips_res = await session.execute(
            select(TripModel).where(*trip_filters).limit(max_users)
        )
        for trip in trips_res.scalars().all():
            if trip.id in processed_trip_ids or not isinstance(
                trip.itinerary_data, dict
            ):
                continue
            kept = ImplicitSignalExtractor.extract_kept_stops(
                user_id=trip.user_id,
                trip_id=trip.id,
                itinerary_data=trip.itinerary_data,
            )
            if kept:
                await cls.record_events(
                    session=session,
                    user_id=trip.user_id,
                    events=kept,
                    trip_id=trip.id,
                    attribute_to_all_participants=True,
                    commit=False,
                )
                kept_trips_processed += 1
                kept_events_recorded += len(kept)

        repo = SqlTasteRepository(session=session)
        prof_res = await session.execute(
            select(UserTasteProfileModel.user_id)
            .where(UserTasteProfileModel.event_count >= 5)
            .limit(max_users)
        )
        refitted_users = 0
        for (uid,) in prof_res.all():
            profile = await repo.get_profile(uid)
            if profile is None:
                continue
            recent = await repo.list_events(uid, limit=250)
            if len(recent) < 5:
                continue
            profile.ranker_weights = TasteRankerModel.fit(recent, profile)
            profile.version += 1
            await repo.save_profile(profile)
            refitted_users += 1

        await session.commit()
        return {
            "kept_trips_processed": kept_trips_processed,
            "kept_events_recorded": kept_events_recorded,
            "refitted_users": refitted_users,
        }
