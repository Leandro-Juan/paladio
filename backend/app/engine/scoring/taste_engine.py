from __future__ import annotations

import logging
import statistics
from datetime import datetime, timezone
from typing import Any

import numpy as np

from app.domain.entities.taste import (
    BehavioralParams,
    BetaPosterior,
    EconomicProfile,
    InferredReason,
    MergedTripTasteProfile,
    PoiPrior,
    TasteEvent,
    TasteSignalType,
    UserTasteProfile,
)
from app.engine.scoring.features import CATEGORY_TO_TAG, TAG_KEYS
from app.engine.scoring.semantic_learning import (
    CATEGORY_ANCHORS,
    SemanticLearningEngine,
)
from app.engine.taxonomy import classify_poi_taxonomy
from app.engine.transit_matrix import haversine_distance

logger = logging.getLogger(__name__)

_PACE_ORDER = {
    "leisurely": 0,
    "relaxed": 0,
    "slow": 0,
    "balanced": 1,
    "intense": 2,
    "fast": 2,
    "packed": 2,
}
_PACE_CANON = {0: "leisurely", 1: "balanced", 2: "intense"}
_BUDGET_ORDER = {
    "budget": 0,
    "low": 0,
    "cheap": 0,
    "balanced": 1,
    "luxury": 2,
    "high": 2,
    "splurge": 2,
}
_BUDGET_CANON = {0: "budget", 1: "balanced", 2: "luxury"}

_CUISINE_KEYWORDS = (
    "italian",
    "japanese",
    "sushi",
    "ramen",
    "indian",
    "thai",
    "mexican",
    "spanish",
    "tapas",
    "french",
    "chinese",
    "korean",
    "vietnamese",
    "mediterranean",
    "greek",
    "seafood",
    "vegan",
    "vegetarian",
    "steakhouse",
    "bakery",
    "cafe",
    "pizza",
)


def _season_from_date(date_str: str | None) -> str | None:
    if not date_str:
        return None
    try:
        month = int(str(date_str)[:7].split("-")[1])
    except (IndexError, ValueError):
        return None
    if month in (12, 1, 2):
        return "season:winter"
    if month in (3, 4, 5):
        return "season:spring"
    if month in (6, 7, 8):
        return "season:summer"
    return "season:autumn"


def _time_bucket_from_str(start_str: Any) -> str | None:
    if start_str is None:
        return None
    try:
        if isinstance(start_str, (int, float)):
            mins = int(start_str)
        else:
            s = str(start_str).strip()
            if "T" in s:
                s = s.split("T", 1)[1]
            elif " " in s:
                s = s.split(" ", 1)[1]
            parts = s.split(":")
            mins = int(parts[0]) * 60 + int(parts[1])
    except (ValueError, IndexError):
        return None
    if mins < 720:
        return "time:morning"
    if mins < 1050:
        return "time:afternoon"
    return "time:evening"


def _parse_hhmm_to_mins(val: Any) -> int | None:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return int(val)
    try:
        s = str(val).strip()
        if "T" in s:
            s = s.split("T", 1)[1]
        elif " " in s:
            s = s.split(" ", 1)[1]
        parts = s.split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, IndexError):
        return None


def _poi_dict_category(poi: dict[str, Any]) -> str:
    if not isinstance(poi, dict):
        return "unknown"
    tax = poi.get("taxonomy_category")
    if tax and tax in TAG_KEYS:
        return str(tax)
    name = str(poi.get("name") or "")
    cat = str(poi.get("category") or "")
    meta = poi.get("metadata") if isinstance(poi.get("metadata"), dict) else None
    derived, _ = classify_poi_taxonomy(name, cat, meta)
    if derived in TAG_KEYS:
        return derived
    cat_up = cat.upper()
    if cat_up in CATEGORY_TO_TAG and CATEGORY_TO_TAG[cat_up]:
        return CATEGORY_TO_TAG[cat_up][0]
    return "art_culture"


def _poi_coords(stop: dict[str, Any]) -> tuple[float, float] | None:
    poi = stop.get("poi") if isinstance(stop.get("poi"), dict) else stop
    if not isinstance(poi, dict):
        return None
    loc = poi.get("location")
    if isinstance(loc, dict):
        lat = loc.get("latitude", loc.get("lat"))
        lon = loc.get("longitude", loc.get("lon"))
        if lat is not None and lon is not None:
            return float(lat), float(lon)
    lat = poi.get("latitude", poi.get("lat"))
    lon = poi.get("longitude", poi.get("lon"))
    if lat is not None and lon is not None:
        return float(lat), float(lon)
    return None


def _extract_cuisines(poi: dict[str, Any]) -> list[str]:
    text = f"{poi.get('name', '')} {poi.get('category', '')} {poi.get('description', '')}".lower()
    return [c for c in _CUISINE_KEYWORDS if c in text]


def _flatten_doc_stops(doc: dict[str, Any]) -> dict[int, list[dict[str, Any]]]:
    days_map: dict[int, list[dict[str, Any]]] = {}
    if not isinstance(doc, dict):
        return days_map
    for idx, day_obj in enumerate(doc.get("days") or []):
        if not isinstance(day_obj, dict):
            continue
        day_num = int(day_obj.get("day", idx + 1))
        itin = day_obj.get("itinerary")
        path = (
            itin.get("path")
            if isinstance(itin, dict)
            else (day_obj.get("path") or day_obj.get("stops") or [])
        )
        if isinstance(path, list):
            days_map[day_num] = [s for s in path if isinstance(s, dict)]
    return days_map


def _is_anchor_category(poi: dict[str, Any]) -> bool:
    cat = str(poi.get("category") or "").upper()
    return cat in ("HOTEL", "AIRPORT")


class ImplicitSignalExtractor:
    """Extracts typed, reason-disambiguated taste events from implicit backend signals."""

    @classmethod
    def extract_from_revision(
        cls,
        user_id: str,
        trip_id: str,
        before_doc: dict[str, Any],
        after_doc: dict[str, Any],
        changes: list[dict[str, Any]] | None = None,
        actor: str = "user",
    ) -> list[TasteEvent]:
        if not user_id:
            return []

        events: list[TasteEvent] = []
        before_days = _flatten_doc_stops(before_doc)
        after_days = _flatten_doc_stops(after_doc)

        season_ctx = _season_from_date(
            (after_doc or {}).get("start_date") or (before_doc or {}).get("start_date")
        )
        base_ctx: dict[str, Any] = {"actor": actor}
        if season_ctx:
            base_ctx["season"] = season_ctx

        before_stops: dict[str, tuple[int, dict[str, Any]]] = {}
        for d, stops in before_days.items():
            for s in stops:
                sid = str(s.get("stop_id") or s.get("id") or "")
                poi = s.get("poi") if isinstance(s.get("poi"), dict) else {}
                if sid and not _is_anchor_category(poi):
                    before_stops[sid] = (d, s)

        after_stops: dict[str, tuple[int, dict[str, Any]]] = {}
        for d, stops in after_days.items():
            for s in stops:
                sid = str(s.get("stop_id") or s.get("id") or "")
                poi = s.get("poi") if isinstance(s.get("poi"), dict) else {}
                if sid and not _is_anchor_category(poi):
                    after_stops[sid] = (d, s)

        removed_sids = [sid for sid in before_stops if sid not in after_stops]
        added_sids = [sid for sid in after_stops if sid not in before_stops]

        # Build added category map per day for swap disambiguation
        added_by_day_cat: dict[tuple[int, str], list[dict[str, Any]]] = {}
        for sid in added_sids:
            day_num, stop = after_stops[sid]
            poi = stop.get("poi") if isinstance(stop.get("poi"), dict) else {}
            cat = _poi_dict_category(poi)
            added_by_day_cat.setdefault((day_num, cat), []).append(stop)

        # 1. Added stops
        for sid in added_sids:
            day_num, stop = after_stops[sid]
            poi = stop.get("poi") if isinstance(stop.get("poi"), dict) else {}
            poi_id = str(poi.get("id") or poi.get("name") or sid)
            cat = _poi_dict_category(poi)
            ctx = {
                **base_ctx,
                "category": cat,
                "poi_name": poi.get("name"),
                "cost_eur": float(poi.get("cost_eur") or 0.0),
                "cuisines": _extract_cuisines(poi),
                "time_bucket": _time_bucket_from_str(stop.get("scheduled_start")),
                "embedding": poi.get("embedding"),
            }
            events.append(
                TasteEvent(
                    user_id=user_id,
                    trip_id=trip_id,
                    entity_type="restaurant" if cat == "food_culinary" else "poi",
                    entity_id=poi_id,
                    event_type=TasteSignalType.STOP_ADDED,
                    polarity=0.85,
                    weight=1.20,
                    inferred_reason=InferredReason.TASTE_MATCH,
                    context=ctx,
                )
            )

        # 2. Removed stops with context-aware reason inference
        for sid in removed_sids:
            day_num, stop = before_stops[sid]
            poi = stop.get("poi") if isinstance(stop.get("poi"), dict) else {}
            poi_id = str(poi.get("id") or poi.get("name") or sid)
            cat = _poi_dict_category(poi)
            remaining_day_stops = [
                s
                for s in after_days.get(day_num, [])
                if not _is_anchor_category(s.get("poi") or {})
            ]
            before_day_stops = [
                s
                for s in before_days.get(day_num, [])
                if not _is_anchor_category(s.get("poi") or {})
            ]

            # Check 2a: Same-category swap
            swapped_same_cat = bool(added_by_day_cat.get((day_num, cat))) or any(
                _poi_dict_category((after_stops[asid][1].get("poi") or {})) == cat
                for asid in added_sids
            )

            # Check 2b: Geographic outlier
            is_distance_outlier = False
            rem_coords = _poi_coords(stop)
            if rem_coords and len(remaining_day_stops) >= 2:
                day_coords = [
                    c for c in (_poi_coords(s) for s in remaining_day_stops) if c
                ]
                if len(day_coords) >= 2:
                    dists_to_rem = [
                        haversine_distance(rem_coords[0], rem_coords[1], c[0], c[1])
                        for c in day_coords
                    ]
                    min_dist_rem = min(dists_to_rem)
                    pair_dists = []
                    for i in range(len(day_coords)):
                        for j in range(i + 1, len(day_coords)):
                            pair_dists.append(
                                haversine_distance(
                                    day_coords[i][0],
                                    day_coords[i][1],
                                    day_coords[j][0],
                                    day_coords[j][1],
                                )
                            )
                    med_dist = statistics.median(pair_dists) if pair_dists else 1.5
                    if min_dist_rem > max(4.0, 2.5 * med_dist):
                        is_distance_outlier = True

            # Check 2c: Pace overload (day duration dropped >= 45m without replacement)
            before_dur = sum(
                int(s.get("duration") or s.get("poi", {}).get("duration_mins") or 60)
                for s in before_day_stops
            )
            after_dur = sum(
                int(s.get("duration") or s.get("poi", {}).get("duration_mins") or 60)
                for s in remaining_day_stops
            )
            is_pace_overload = (
                not added_sids
                and len(before_day_stops) >= 3
                and (before_dur - after_dur) >= 45
            )

            if swapped_same_cat:
                reason = InferredReason.SAME_CATEGORY_SWAP
                polarity, weight = -0.65, 1.0
                affect_cat = False
            elif is_distance_outlier:
                reason = InferredReason.DISTANCE_OUTLIER
                polarity, weight = -0.25, 0.35
                affect_cat = True
            elif is_pace_overload:
                reason = InferredReason.PACE_OVERLOAD
                polarity, weight = -0.35, 0.45
                affect_cat = True
            else:
                reason = InferredReason.TASTE_DISLIKE
                after_rev = (after_doc or {}).get("revision")
                early_after_gen = isinstance(after_rev, int) and after_rev <= 2
                polarity, weight = (-0.75, 1.15) if early_after_gen else (-0.65, 0.80)
                affect_cat = True

            events.append(
                TasteEvent(
                    user_id=user_id,
                    trip_id=trip_id,
                    entity_type="restaurant" if cat == "food_culinary" else "poi",
                    entity_id=poi_id,
                    event_type=TasteSignalType.STOP_REMOVED,
                    polarity=polarity,
                    weight=weight,
                    inferred_reason=reason,
                    context={
                        **base_ctx,
                        "category": cat,
                        "affect_category": affect_cat,
                        "poi_name": poi.get("name"),
                        "cost_eur": float(poi.get("cost_eur") or 0.0),
                        "prev_stops_in_day": len(before_day_stops),
                        "after_stops_in_day": len(remaining_day_stops),
                        "embedding": poi.get("embedding"),
                    },
                )
            )

        # 3. Inspect explicit changes for lock/unlock, pace, bounds, reorder/time edits
        for ch in changes or []:
            kind = str(ch.get("kind") or "")
            after_val = ch.get("after") if isinstance(ch.get("after"), dict) else {}
            sid = str(ch.get("stop_id") or "")

            if kind in ("lock_stop", "unlock_stop"):
                locked = after_val.get("locked", kind == "lock_stop")
                stop_info = after_stops.get(sid) or before_stops.get(sid)
                poi = (
                    (stop_info[1].get("poi") or {})
                    if stop_info and isinstance(stop_info[1], dict)
                    else {}
                )
                poi_id = str(poi.get("id") or poi.get("name") or sid or "unknown")
                cat = _poi_dict_category(poi)
                events.append(
                    TasteEvent(
                        user_id=user_id,
                        trip_id=trip_id,
                        entity_type="poi",
                        entity_id=poi_id,
                        event_type=(
                            TasteSignalType.STOP_LOCKED
                            if locked
                            else TasteSignalType.STOP_UNLOCKED
                        ),
                        polarity=0.95 if locked else -0.15,
                        weight=1.50 if locked else 0.30,
                        inferred_reason=InferredReason.TASTE_MATCH,
                        context={
                            **base_ctx,
                            "category": cat,
                            "poi_name": poi.get("name"),
                            "embedding": poi.get("embedding"),
                        },
                    )
                )
            elif kind == "set_pace":
                new_pace = str(after_val.get("pace") or "").lower()
                if new_pace:
                    events.append(
                        TasteEvent(
                            user_id=user_id,
                            trip_id=trip_id,
                            entity_type="pace",
                            entity_id=new_pace,
                            event_type=TasteSignalType.PACE_CHANGED,
                            polarity=1.0,
                            weight=1.4,
                            inferred_reason=InferredReason.EXPLICIT_CONSTRAINT,
                            context={**base_ctx, "pace": new_pace},
                        )
                    )
            elif kind == "set_day_bounds":
                st_m = _parse_hhmm_to_mins(after_val.get("start_time"))
                en_m = _parse_hhmm_to_mins(after_val.get("end_time"))
                events.append(
                    TasteEvent(
                        user_id=user_id,
                        trip_id=trip_id,
                        entity_type="pace",
                        entity_id=f"day_{ch.get('day', 1)}_bounds",
                        event_type=TasteSignalType.BOUNDS_CHANGED,
                        polarity=0.6,
                        weight=1.0,
                        inferred_reason=InferredReason.SCHEDULE_ADJUSTMENT,
                        context={
                            **base_ctx,
                            "start_time_mins": st_m,
                            "end_time_mins": en_m,
                        },
                    )
                )
            elif kind in ("set_stop_time", "move_stop") and sid in after_stops:
                _, stop = after_stops[sid]
                poi = stop.get("poi") if isinstance(stop.get("poi"), dict) else {}
                poi_id = str(poi.get("id") or poi.get("name") or sid)
                cat = _poi_dict_category(poi)
                tb = _time_bucket_from_str(
                    after_val.get("scheduled_start") or stop.get("scheduled_start")
                )
                events.append(
                    TasteEvent(
                        user_id=user_id,
                        trip_id=trip_id,
                        entity_type="poi",
                        entity_id=poi_id,
                        event_type=TasteSignalType.STOP_MOVED,
                        polarity=0.35,
                        weight=0.50,
                        inferred_reason=InferredReason.SCHEDULE_ADJUSTMENT,
                        context={
                            **base_ctx,
                            "category": cat,
                            "time_bucket": tb,
                            "affect_category": False,
                        },
                    )
                )

        if actor == "undo" and events:
            for ev in events:
                ev.event_type = TasteSignalType.UNDO_CORRECTION

        return events

    @classmethod
    def extract_from_collection(
        cls,
        user_id: str,
        poi_id: str,
        poi_metadata: dict[str, Any] | None,
        action: str,
        trip_id: str | None = None,
    ) -> TasteEvent | None:
        meta = poi_metadata or {}
        cat = _poi_dict_category(meta) if meta else "unknown"
        act = (action or "").lower().strip()

        if act == "want_to_go":
            return None
        if act == "visited":
            ev_type = TasteSignalType.VISIT_COMPLETED
            polarity, weight = 0.90, 1.35
            reason = InferredReason.REPEAT_VISIT
        elif act in ("skipped", "removed", "deleted"):
            ev_type = (
                TasteSignalType.VISIT_SKIPPED
                if act == "skipped"
                else TasteSignalType.COLLECTION_REMOVED
            )
            polarity, weight = -0.55, 0.75
            reason = InferredReason.TASTE_DISLIKE
        else:
            ev_type = TasteSignalType.COLLECTION_SAVED
            polarity, weight = 0.75, 1.00
            reason = InferredReason.TASTE_MATCH

        return TasteEvent(
            user_id=user_id,
            trip_id=trip_id,
            entity_type="restaurant" if cat == "food_culinary" else "poi",
            entity_id=str(poi_id),
            event_type=ev_type,
            polarity=polarity,
            weight=weight,
            inferred_reason=reason,
            context={
                "category": cat,
                "poi_name": meta.get("name"),
                "cuisines": _extract_cuisines(meta) if meta else [],
                "embedding": meta.get("embedding"),
                "action": act,
            },
        )

    @classmethod
    def extract_from_ticket(
        cls,
        user_id: str,
        trip_id: str | None,
        ticket: dict[str, Any],
    ) -> list[TasteEvent]:
        if not user_id or not ticket:
            return []
        t_type = str(ticket.get("ticket_type") or "other").lower()
        title = str(ticket.get("title") or ticket.get("location_or_venue") or t_type)
        provider = ticket.get("provider")
        price = ticket.get("price")
        meta = ticket.get("ticket_metadata") or ticket.get("metadata") or {}
        if not isinstance(meta, dict):
            meta = {}

        events: list[TasteEvent] = []
        if t_type == "flight":
            start_time = ticket.get("start_time")
            dep_hour = None
            if start_time:
                try:
                    dt = (
                        start_time
                        if isinstance(start_time, datetime)
                        else datetime.fromisoformat(str(start_time))
                    )
                    dep_hour = dt.hour
                except ValueError:
                    dep_hour = None
            events.append(
                TasteEvent(
                    user_id=user_id,
                    trip_id=trip_id,
                    entity_type="flight",
                    entity_id=str(ticket.get("id") or title),
                    event_type=TasteSignalType.TICKET_BOOKED,
                    polarity=0.90,
                    weight=1.35,
                    inferred_reason=InferredReason.TASTE_MATCH,
                    context={
                        "airline": provider or meta.get("airline"),
                        "departure_hour": dep_hour,
                        "price": float(price) if price is not None else None,
                        "stops": meta.get("stops"),
                    },
                )
            )
        elif t_type in ("hotel", "lodging", "accommodation"):
            events.append(
                TasteEvent(
                    user_id=user_id,
                    trip_id=trip_id,
                    entity_type="hotel",
                    entity_id=str(meta.get("property_id") or ticket.get("id") or title),
                    event_type=TasteSignalType.TICKET_BOOKED,
                    polarity=0.90,
                    weight=1.35,
                    inferred_reason=InferredReason.TASTE_MATCH,
                    context={
                        "property_type": meta.get("property_type", "hotel"),
                        "stars": meta.get("stars"),
                        "amenities": meta.get("amenities") or [],
                        "free_cancellation": meta.get("free_cancellation"),
                        "price": float(price) if price is not None else None,
                    },
                )
            )
        else:
            cat = _poi_dict_category(
                {"name": title, "category": t_type, "metadata": meta}
            )
            events.append(
                TasteEvent(
                    user_id=user_id,
                    trip_id=trip_id,
                    entity_type="poi",
                    entity_id=str(meta.get("poi_id") or ticket.get("id") or title),
                    event_type=TasteSignalType.TICKET_BOOKED,
                    polarity=0.90,
                    weight=1.35,
                    inferred_reason=InferredReason.TASTE_MATCH,
                    context={
                        "category": cat,
                        "poi_name": title,
                        "price": float(price) if price is not None else None,
                    },
                )
            )
        return events

    @classmethod
    def extract_from_deal(
        cls,
        user_id: str,
        deal_dict: dict[str, Any],
        feedback: str,
    ) -> TasteEvent:
        fb = (feedback or "").lower().strip()
        accepted = fb in ("accepted", "booked", "saved", "liked")
        pkg = deal_dict.get("package_json") or deal_dict
        if not isinstance(pkg, dict):
            pkg = {}
        flight = pkg.get("flight") if isinstance(pkg.get("flight"), dict) else {}
        hotel = pkg.get("lodging") or pkg.get("hotel") or {}
        if not isinstance(hotel, dict):
            hotel = {}

        return TasteEvent(
            user_id=user_id,
            trip_id=None,
            entity_type="deal",
            entity_id=str(deal_dict.get("id") or pkg.get("destination_code") or "deal"),
            event_type=(
                TasteSignalType.DEAL_ACCEPTED
                if accepted
                else TasteSignalType.DEAL_DISCARDED
            ),
            polarity=0.85 if accepted else -0.50,
            weight=1.30 if accepted else 0.80,
            inferred_reason=InferredReason.PRICE_SENSITIVITY,
            context={
                "destination": pkg.get("destination_code") or pkg.get("destination"),
                "price_eur": pkg.get("total_price_eur")
                or deal_dict.get("total_price_cents", 0) / 100.0,
                "discount_pct": pkg.get("savings_pct") or pkg.get("discount_pct"),
                "airline": flight.get("airline"),
                "property_id": hotel.get("property_id"),
                "property_type": hotel.get("property_type"),
                "stars": hotel.get("stars"),
            },
        )

    @classmethod
    def extract_from_chat(
        cls,
        user_id: str,
        trip_id: str | None,
        target: str,
        target_type: str,
        polarity: float,
        hard_veto: bool = False,
    ) -> TasteEvent:
        return TasteEvent(
            user_id=user_id,
            trip_id=trip_id,
            entity_type=target_type or "category",
            entity_id=target.strip().lower(),
            event_type=TasteSignalType.CHAT_PREFERENCE,
            polarity=float(np.clip(polarity, -1.0, 1.0)),
            weight=2.50,
            inferred_reason=InferredReason.EXPLICIT_CONSTRAINT,
            context={
                "category": target.strip().lower()
                if target_type == "category"
                else None,
                "cuisine": target.strip().lower() if target_type == "cuisine" else None,
                "hard_veto": bool(hard_veto),
                "affect_category": target_type == "category",
            },
        )

    @classmethod
    def extract_kept_stops(
        cls,
        user_id: str,
        trip_id: str,
        itinerary_data: dict[str, Any],
    ) -> list[TasteEvent]:
        """Emits weak positive STOP_KEPT signals for unremoved stops on completed trips."""
        if (
            not user_id
            or user_id == "default_user"
            or not isinstance(itinerary_data, dict)
        ):
            return []
        events: list[TasteEvent] = []
        for _day_num, stops in _flatten_doc_stops(itinerary_data).items():
            for stop in stops:
                poi = stop.get("poi") if isinstance(stop.get("poi"), dict) else stop
                poi_id = str(
                    poi.get("id")
                    or stop.get("poi_id")
                    or stop.get("id")
                    or stop.get("stop_id")
                    or poi.get("name")
                    or ""
                )
                if not poi_id:
                    continue
                raw_cat = str(poi.get("category") or "").lower().strip()
                cat = _poi_dict_category(poi)
                if raw_cat in (
                    "transit",
                    "station",
                    "metro",
                    "train",
                    "tram",
                    "bus",
                    "airport",
                    "flight",
                    "lodging",
                    "hotel",
                ) or cat in ("transit", "lodging", "hotel"):
                    continue
                events.append(
                    TasteEvent(
                        user_id=user_id,
                        trip_id=trip_id,
                        entity_type="poi",
                        entity_id=poi_id,
                        event_type=TasteSignalType.STOP_KEPT,
                        polarity=0.35,
                        weight=0.45,
                        inferred_reason=InferredReason.TASTE_MATCH,
                        context={
                            "category": cat,
                            "poi_name": poi.get("name"),
                            "embedding": poi.get("embedding"),
                        },
                    )
                )
        return events


class TasteProfileUpdater:
    """Applies signed, time-decayed updates to a per-user taste profile."""

    HALF_LIFE_DAYS: float = 180.0

    @classmethod
    def _decay_posterior(cls, post: BetaPosterior, decay: float) -> BetaPosterior:
        alpha = 2.0 + max(0.0, post.alpha - 2.0) * decay
        beta = 2.0 + max(0.0, post.beta - 2.0) * decay
        return BetaPosterior(alpha=round(alpha, 4), beta=round(beta, 4))

    @classmethod
    def _update_beta(
        cls, post: BetaPosterior, polarity: float, strength: float
    ) -> BetaPosterior:
        mag = max(0.0, min(5.0, strength))
        if polarity >= 0:
            new_alpha = post.alpha + mag * polarity
            new_beta = post.beta
        else:
            new_alpha = post.alpha
            new_beta = post.beta + mag * abs(polarity)

        # Drift protection: if recent signal strongly opposes an entrenched extreme, soften inertia
        if (polarity < -0.5 and post.mean > 0.75) or (
            polarity > 0.5 and post.mean < 0.25
        ):
            new_alpha = 2.0 + (new_alpha - 2.0) * 0.85
            new_beta = 2.0 + (new_beta - 2.0) * 0.85

        return BetaPosterior(
            alpha=round(max(0.1, new_alpha), 4), beta=round(max(0.1, new_beta), 4)
        )

    @classmethod
    def apply_events(
        cls,
        profile: UserTasteProfile,
        events: list[TasteEvent],
        semantic_engine: SemanticLearningEngine | None = None,
        now: datetime | None = None,
    ) -> UserTasteProfile:
        if not events:
            return profile

        ref_now = now or datetime.now(timezone.utc)
        if profile.last_event_at:
            try:
                last_dt = datetime.fromisoformat(profile.last_event_at)
                if last_dt.tzinfo is None:
                    last_dt = last_dt.replace(tzinfo=timezone.utc)
                elapsed_days = max(0.0, (ref_now - last_dt).total_seconds() / 86400.0)
                if elapsed_days > 1.0:
                    decay = 0.5 ** (elapsed_days / cls.HALF_LIFE_DAYS)
                    for tag, post in list(profile.category_posteriors.items()):
                        profile.category_posteriors[tag] = cls._decay_posterior(
                            post, decay
                        )
            except ValueError:
                pass

        for ev in sorted(events, key=lambda e: e.created_at):
            ev_dt = ev.created_at
            if ev_dt.tzinfo is None:
                ev_dt = ev_dt.replace(tzinfo=timezone.utc)
            age_days = max(0.0, (ref_now - ev_dt).total_seconds() / 86400.0)
            time_decay = 0.5 ** (age_days / cls.HALF_LIFE_DAYS)
            eff_weight = float(ev.weight) * time_decay
            ctx = ev.context or {}
            cat = ctx.get("category")

            # 1. Category posteriors (unless explicitly marked not to affect category, e.g. same-cat swap)
            affect_cat = ctx.get("affect_category", True)
            if cat and cat in TAG_KEYS and affect_cat:
                cur_post = profile.category_posteriors.get(cat) or BetaPosterior()
                updated_post = cls._update_beta(cur_post, ev.polarity, eff_weight)
                profile.category_posteriors[cat] = updated_post

                if (
                    ev.event_type == TasteSignalType.CHAT_PREFERENCE
                    and ctx.get("hard_veto")
                    and ev.polarity < 0
                ):
                    if cat not in profile.disliked_tags:
                        profile.disliked_tags.append(cat)
                elif (
                    ev.event_type == TasteSignalType.CHAT_PREFERENCE and ev.polarity > 0
                ):
                    if cat in profile.disliked_tags:
                        profile.disliked_tags.remove(cat)

                # Contextual sub-profiles (season, time_bucket, group)
                for ctx_key in (ctx.get("season"), ctx.get("time_bucket")):
                    if ctx_key:
                        sub_map = profile.contextual_profiles.setdefault(
                            str(ctx_key), {}
                        )
                        sub_post = sub_map.get(cat) or BetaPosterior()
                        sub_map[cat] = cls._update_beta(
                            sub_post, ev.polarity, eff_weight * 0.8
                        )

            # 2. Cuisine posteriors
            cuisines = list(ctx.get("cuisines") or [])
            if ctx.get("cuisine"):
                cuisines.append(str(ctx["cuisine"]).lower())
            for cuis in dict.fromkeys(c.lower() for c in cuisines if c):
                c_post = profile.cuisine_posteriors.get(cuis) or BetaPosterior()
                profile.cuisine_posteriors[cuis] = cls._update_beta(
                    c_post, ev.polarity, eff_weight
                )

            # 3. POI-level priors & repeat memory
            if ev.entity_type in ("poi", "restaurant") and ev.entity_id:
                prior = profile.poi_priors.get(ev.entity_id) or PoiPrior(category=cat)
                if ev.event_type == TasteSignalType.VISIT_COMPLETED:
                    prior.visited_count += 1
                    prior.last_visited_at = ev_dt.isoformat()
                if ev.event_type == TasteSignalType.STOP_LOCKED:
                    prior.locked_count += 1
                if (
                    ev.event_type == TasteSignalType.CHAT_PREFERENCE
                    and ctx.get("hard_veto")
                    and ev.polarity < 0
                ):
                    prior.hard_veto = True
                elif (
                    ev.event_type == TasteSignalType.STOP_REMOVED
                    and ev.inferred_reason == InferredReason.SAME_CATEGORY_SWAP
                ):
                    prior.score_delta = max(-40.0, prior.score_delta - 18.0)
                elif (
                    ev.event_type == TasteSignalType.STOP_REMOVED
                    and ev.inferred_reason == InferredReason.TASTE_DISLIKE
                ):
                    prior.score_delta = max(-40.0, prior.score_delta - 12.0)
                elif ev.polarity > 0:
                    prior.score_delta = min(
                        30.0,
                        prior.score_delta + 8.0 * ev.polarity * min(1.5, eff_weight),
                    )
                if cat and not prior.category:
                    prior.category = cat
                profile.poi_priors[ev.entity_id] = prior

            # 4. Behavioral parameters
            bp = profile.behavioral_params
            if ev.inferred_reason == InferredReason.DISTANCE_OUTLIER:
                bp.walking_tolerance_km = round(
                    max(2.0, bp.walking_tolerance_km * 0.88), 2
                )
            elif ev.inferred_reason == InferredReason.PACE_OVERLOAD:
                after_stops = float(ctx.get("after_stops_in_day") or 2.5)
                bp.preferred_stops_per_day = round(
                    max(1.5, 0.75 * bp.preferred_stops_per_day + 0.25 * after_stops), 2
                )
                if bp.preferred_stops_per_day <= 2.3:
                    bp.pace = "leisurely"
            elif ev.event_type == TasteSignalType.PACE_CHANGED and ctx.get("pace"):
                p_str = str(ctx["pace"]).lower()
                if p_str in _PACE_ORDER:
                    bp.pace = _PACE_CANON[_PACE_ORDER[p_str]]
                    bp.preferred_stops_per_day = (
                        2.0
                        if bp.pace == "leisurely"
                        else (5.0 if bp.pace == "intense" else 3.5)
                    )
            elif ev.event_type == TasteSignalType.BOUNDS_CHANGED:
                if ctx.get("start_time_mins") is not None:
                    st_m = int(ctx["start_time_mins"])
                    bp.start_time_mins = int(
                        round(0.6 * bp.start_time_mins + 0.4 * st_m)
                    )
                if ctx.get("end_time_mins") is not None:
                    en_m = int(ctx["end_time_mins"])
                    bp.end_time_mins = int(round(0.6 * bp.end_time_mins + 0.4 * en_m))
                if bp.start_time_mins <= 495:
                    bp.chronotype = "early_bird"
                elif bp.end_time_mins >= 1350 or bp.start_time_mins >= 600:
                    bp.chronotype = "night_owl"
                else:
                    bp.chronotype = "balanced"

            # 5. Economic, Lodging, Flight & Deal preferences
            econ = profile.economic_profile
            if ev.entity_type == "hotel":
                lp = econ.lodging_preferences
                ptype = ctx.get("property_type")
                if ptype:
                    types_map = dict(lp.get("preferred_types") or {})
                    types_map[ptype] = round(
                        float(types_map.get(ptype, 0.5)) + 0.15 * ev.polarity, 3
                    )
                    lp["preferred_types"] = types_map
                if ctx.get("stars") is not None:
                    stars_val = float(ctx["stars"])
                    cur_stars = lp.get("preferred_stars")
                    lp["preferred_stars"] = (
                        stars_val
                        if cur_stars is None
                        else round(0.7 * float(cur_stars) + 0.3 * stars_val, 2)
                    )
                if ctx.get("free_cancellation") is True:
                    lp["free_cancellation_bias"] = round(
                        min(1.0, float(lp.get("free_cancellation_bias", 0.5)) + 0.12), 3
                    )
                for am in ctx.get("amenities") or []:
                    am_key = str(am).strip().lower()
                    if am_key:
                        am_map = dict(lp.get("amenity_affinities") or {})
                        am_map[am_key] = round(
                            min(1.0, float(am_map.get(am_key, 0.5)) + 0.15), 3
                        )
                        lp["amenity_affinities"] = am_map
            elif ev.entity_type == "flight":
                fp = econ.flight_preferences
                airline = ctx.get("airline")
                if airline:
                    al_map = dict(fp.get("airline_affinities") or {})
                    al_key = str(airline).strip().lower()
                    al_map[al_key] = round(
                        float(
                            np.clip(
                                float(al_map.get(al_key, 0.5)) + 0.15 * ev.polarity,
                                0.0,
                                1.0,
                            )
                        ),
                        3,
                    )
                    fp["airline_affinities"] = al_map
                dep_hr = ctx.get("departure_hour")
                if dep_hr is not None:
                    hr = int(dep_hr)
                    fp["preferred_departure_window"] = [max(0, hr - 2), min(23, hr + 2)]
                if ctx.get("stops") == 0:
                    fp["direct_flight_bias"] = round(
                        min(1.0, float(fp.get("direct_flight_bias", 0.5)) + 0.15), 3
                    )
            elif ev.entity_type == "deal":
                dr = econ.deal_responsiveness
                lp = econ.lodging_preferences
                fp = econ.flight_preferences
                airline = str(ctx.get("airline") or "").strip().lower()
                prop_type = str(ctx.get("property_type") or "").strip().lower()
                stars = ctx.get("stars")
                if ev.polarity > 0:
                    dr["accepted_count"] = int(dr.get("accepted_count", 0)) + 1
                    disc = ctx.get("discount_pct")
                    if disc is not None:
                        dr["target_discount_pct"] = round(
                            0.7 * float(dr.get("target_discount_pct", 15.0))
                            + 0.3 * float(disc),
                            1,
                        )
                    if airline:
                        affs = dict(fp.get("airline_affinities") or {})
                        affs[airline] = round(
                            0.7 * float(affs.get(airline, 0.5)) + 0.3 * 1.0, 3
                        )
                        fp["airline_affinities"] = affs
                    if prop_type:
                        pt = dict(lp.get("preferred_types") or {})
                        pt[prop_type] = round(float(pt.get(prop_type, 0.0)) + 0.5, 3)
                        lp["preferred_types"] = pt
                    if stars is not None:
                        cur_stars = lp.get("preferred_stars")
                        lp["preferred_stars"] = round(
                            0.7 * float(cur_stars if cur_stars is not None else stars)
                            + 0.3 * float(stars),
                            2,
                        )
                else:
                    dr["discarded_count"] = int(dr.get("discarded_count", 0)) + 1
                    econ.price_sensitivity = round(
                        min(1.0, econ.price_sensitivity + 0.05), 3
                    )
                    pid = ctx.get("property_id")
                    if pid:
                        discarded = list(lp.get("discarded_property_ids") or [])
                        if pid not in discarded:
                            discarded.append(str(pid))
                        lp["discarded_property_ids"] = discarded
                    if airline:
                        affs = dict(fp.get("airline_affinities") or {})
                        affs[airline] = round(
                            0.7 * float(affs.get(airline, 0.5)) + 0.3 * 0.0, 3
                        )
                        fp["airline_affinities"] = affs

            # 6. 768D signed vector update
            sig_vec = ctx.get("embedding")
            if (
                sig_vec is None
                and semantic_engine is not None
                and cat in CATEGORY_ANCHORS
            ):
                sig_vec = semantic_engine.synthesize_768d_from_harmonics(
                    {t: (1.0 if t == cat else 0.0) for t in TAG_KEYS}
                )
            if sig_vec is not None and len(sig_vec) == 768:
                cold_gamma = 0.30 if profile.event_count < 10 else 0.15
                profile.embedding = SemanticLearningEngine.apply_signed_ema_update(
                    v_history=profile.embedding,
                    v_signal=sig_vec,
                    polarity=ev.polarity,
                    weight=ev.weight,
                    base_gamma=cold_gamma,
                    age_days=age_days,
                    half_life_days=cls.HALF_LIFE_DAYS,
                )

            profile.event_count += 1
            profile.last_event_at = ev_dt.isoformat()

        profile.is_neutral = False
        profile.version += 1
        return profile


class TripTasteAggregator:
    """Combines per-user taste profiles of all trip participants into one group profile."""

    @classmethod
    def merge_profiles(
        cls,
        profiles: list[UserTasteProfile],
        organizer_user_id: str | None = None,
        total_participant_count: int | None = None,
    ) -> MergedTripTasteProfile:
        active_profiles = [
            p
            for p in profiles
            if (not p.is_neutral)
            or p.event_count > 0
            or bool(p.disliked_tags)
            or bool(p.poi_priors)
        ]

        total_count = max(
            1,
            total_participant_count
            if total_participant_count is not None
            else len(profiles),
            len(profiles),
        )
        anon_count = max(0, total_count - len(active_profiles))

        if not active_profiles:
            anon_affs = {
                f"anon_{i}": {t: 0.5 for t in TAG_KEYS} for i in range(total_count)
            }
            return MergedTripTasteProfile(
                version=1,
                traveler_count=total_count,
                active_profile_count=0,
                traveler_affinities=anon_affs,
            )

        # Weights: organizer slightly higher (1.15), other active travelers 1.0
        weights = [
            1.15 if (organizer_user_id and p.user_id == organizer_user_id) else 1.0
            for p in active_profiles
        ]
        total_w = sum(weights) or 1.0

        vetoed_categories: set[str] = set()
        tag_affinities: dict[str, float] = {}
        tag_uncertainties: dict[str, float] = {}

        for tag in TAG_KEYS:
            is_vetoed = False
            means: list[float] = []
            uncs: list[float] = []
            for p in active_profiles:
                post = p.category_posteriors.get(tag) or BetaPosterior()
                if tag in p.disliked_tags or post.is_hard_dislike:
                    is_vetoed = True
                means.append(0.05 if tag in p.disliked_tags else post.mean)
                uncs.append(post.uncertainty)

            if is_vetoed:
                vetoed_categories.add(tag)
                tag_affinities[tag] = 0.05
            else:
                w_mean = sum(w * m for w, m in zip(weights, means)) / total_w
                min_m = min(means)
                # Least-misery fairness blend
                blended = 0.60 * w_mean + 0.40 * min_m
                if min_m < 0.35:
                    blended -= (0.35 - min_m) * 0.30
                tag_affinities[tag] = round(float(np.clip(blended, 0.05, 0.99)), 4)

            tag_uncertainties[tag] = round(sum(uncs) / len(uncs), 4)

        # Merge POI priors (hard veto from any traveler vetoes for group)
        merged_poi_priors: dict[str, PoiPrior] = {}
        for p in active_profiles:
            for poi_id, prior in p.poi_priors.items():
                cur = merged_poi_priors.get(poi_id)
                if cur is None:
                    merged_poi_priors[poi_id] = PoiPrior(**prior.model_dump())
                else:
                    cur.hard_veto = cur.hard_veto or prior.hard_veto
                    cur.score_delta = round(
                        0.5 * (cur.score_delta + prior.score_delta), 2
                    )
                    cur.visited_count = max(cur.visited_count, prior.visited_count)
                    cur.locked_count = max(cur.locked_count, prior.locked_count)
                    if prior.last_visited_at and (
                        not cur.last_visited_at
                        or prior.last_visited_at > cur.last_visited_at
                    ):
                        cur.last_visited_at = prior.last_visited_at

        # Merge preferred cuisines (mean >= 0.60 and not disliked by anyone)
        all_cuisines: set[str] = set()
        for p in active_profiles:
            all_cuisines.update(p.cuisine_posteriors.keys())
        preferred_cuisines: list[str] = []
        for cuis in sorted(all_cuisines):
            c_means = [
                (
                    p.cuisine_posteriors[cuis].mean
                    if cuis in p.cuisine_posteriors
                    else 0.5
                )
                for p in active_profiles
            ]
            if min(c_means) >= 0.35 and (sum(c_means) / len(c_means)) >= 0.58:
                preferred_cuisines.append(cuis)

        # Merge contextual sub-profiles
        merged_ctx: dict[str, dict[str, float]] = {}
        all_ctx_keys: set[str] = set()
        for p in active_profiles:
            all_ctx_keys.update(p.contextual_profiles.keys())
        for ctx_k in all_ctx_keys:
            merged_ctx[ctx_k] = {}
            for tag in TAG_KEYS:
                vals = [
                    p.contextual_profiles[ctx_k][tag].mean
                    for p in active_profiles
                    if ctx_k in p.contextual_profiles
                    and tag in p.contextual_profiles[ctx_k]
                ]
                if vals:
                    merged_ctx[ctx_k][tag] = round(
                        min(vals) * 0.4 + (sum(vals) / len(vals)) * 0.6, 4
                    )

        # Conservative behavioral bounds across active travelers
        walk_km = min(p.behavioral_params.walking_tolerance_km for p in active_profiles)
        stops_day = min(
            p.behavioral_params.preferred_stops_per_day for p in active_profiles
        )
        start_m = max(p.behavioral_params.start_time_mins for p in active_profiles)
        end_m = min(p.behavioral_params.end_time_mins for p in active_profiles)
        if end_m - start_m < 240:
            end_m = min(1410, start_m + 360)
        slowest_pace_idx = min(
            _PACE_ORDER.get(p.behavioral_params.pace.lower(), 1)
            for p in active_profiles
        )
        crowd_tol = min(p.behavioral_params.crowd_tolerance for p in active_profiles)

        merged_behavioral = BehavioralParams(
            walking_tolerance_km=walk_km,
            preferred_stops_per_day=stops_day,
            start_time_mins=start_m,
            end_time_mins=end_m,
            chronotype=active_profiles[0].behavioral_params.chronotype,
            crowd_tolerance=crowd_tol,
            pace=_PACE_CANON[slowest_pace_idx],
        )

        # Conservative economic profile + intersection of lodging/flight/deal constraints
        min_budget_idx = min(
            _BUDGET_ORDER.get(p.economic_profile.budget_tier.lower(), 1)
            for p in active_profiles
        )
        max_price_sens = max(
            p.economic_profile.price_sensitivity for p in active_profiles
        )
        discarded_props: list[str] = []
        airline_affs: dict[str, float] = {}
        amenity_affs: dict[str, float] = {}
        stars_list: list[float] = []
        fc_biases: list[float] = []
        type_dicts: list[dict[str, float]] = []
        dep_windows: list[tuple[int, int]] = []
        loc_weights: list[float] = []
        for p in active_profiles:
            lp = p.economic_profile.lodging_preferences
            for pid in lp.get("discarded_property_ids") or []:
                if pid not in discarded_props:
                    discarded_props.append(pid)
            if lp.get("preferred_stars") is not None:
                stars_list.append(float(lp["preferred_stars"]))
            fc_biases.append(float(lp.get("free_cancellation_bias", 0.5)))
            loc_weights.append(float(lp.get("location_vs_price_weight", 0.5)))
            pt = lp.get("preferred_types") or {}
            if isinstance(pt, dict) and pt:
                type_dicts.append({str(k).lower(): float(v) for k, v in pt.items()})
            for am, val in (lp.get("amenity_affinities") or {}).items():
                amenity_affs[am] = max(amenity_affs.get(am, 0.0), float(val))
            fp = p.economic_profile.flight_preferences
            for al, val in (fp.get("airline_affinities") or {}).items():
                cur = airline_affs.get(al, 1.0)
                airline_affs[al] = min(cur, float(val))
            dw = fp.get("preferred_departure_window")
            if isinstance(dw, (list, tuple)) and len(dw) == 2:
                dep_windows.append((int(dw[0]), int(dw[1])))

        # Intersect acceptable lodging types across travelers with expressed preferences
        merged_types: dict[str, float] = {}
        if type_dicts:
            common_types = set(type_dicts[0].keys())
            for td in type_dicts[1:]:
                common_types &= set(td.keys())
            for k in sorted(common_types):
                merged_types[k] = round(min(td[k] for td in type_dicts), 3)

        # Intersect flight departure windows when travelers overlap
        merged_dep_window: list[int] | None = None
        if dep_windows:
            lo = max(w[0] for w in dep_windows)
            hi = min(w[1] for w in dep_windows)
            if lo <= hi:
                merged_dep_window = [lo, hi]

        merged_economic = EconomicProfile(
            budget_tier=_BUDGET_CANON[min_budget_idx],
            price_sensitivity=max_price_sens,
            lodging_preferences={
                "preferred_types": merged_types,
                "preferred_stars": round(max(stars_list), 2) if stars_list else None,
                "amenity_affinities": amenity_affs,
                "free_cancellation_bias": max(fc_biases) if fc_biases else 0.5,
                "location_vs_price_weight": round(statistics.mean(loc_weights), 3)
                if loc_weights
                else 0.5,
                "discarded_property_ids": discarded_props,
            },
            flight_preferences={
                "preferred_departure_window": merged_dep_window,
                "airline_affinities": airline_affs,
                "direct_flight_bias": max(
                    float(
                        p.economic_profile.flight_preferences.get(
                            "direct_flight_bias", 0.5
                        )
                    )
                    for p in active_profiles
                ),
            },
        )

        # Normalized weighted 768D centroid
        centroid = None
        vec_profiles = [
            (w, np.asarray(p.embedding, dtype=np.float32))
            for w, p in zip(weights, active_profiles)
            if p.embedding is not None and len(p.embedding) == 768
        ]
        if vec_profiles:
            acc = np.zeros(768, dtype=np.float32)
            for w, vec in vec_profiles:
                acc += w * SemanticLearningEngine.normalize_vector(vec)
            centroid = SemanticLearningEngine.normalize_vector(acc).tolist()

        # Per-traveler vectors and affinities (include unlinked neutral participants for floor)
        traveler_affinities: dict[str, dict[str, float]] = {
            p.user_id: p.get_tag_affinities() for p in active_profiles
        }
        for i in range(anon_count):
            traveler_affinities[f"anon_{i}"] = {t: 0.5 for t in TAG_KEYS}

        traveler_vectors: dict[str, list[float]] = {
            p.user_id: p.embedding
            for p in active_profiles
            if p.embedding is not None and len(p.embedding) == 768
        }

        combined_version = sum(p.version for p in active_profiles)
        ranker_w = (
            active_profiles[0].ranker_weights if len(active_profiles) == 1 else None
        )

        return MergedTripTasteProfile(
            version=combined_version,
            traveler_count=total_count,
            active_profile_count=len(active_profiles),
            embedding=centroid,
            tag_affinities=tag_affinities,
            tag_uncertainties=tag_uncertainties,
            vetoed_categories=sorted(vetoed_categories),
            preferred_cuisines=preferred_cuisines,
            poi_priors=merged_poi_priors,
            contextual_profiles=merged_ctx,
            behavioral_params=merged_behavioral,
            economic_profile=merged_economic,
            traveler_affinities=traveler_affinities,
            traveler_vectors=traveler_vectors,
            ranker_weights=ranker_w,
        )
