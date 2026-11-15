from __future__ import annotations

from datetime import datetime
from typing import Any


def _extract_hour(time_val: Any) -> int | None:
    if not time_val:
        return None
    s = str(time_val).strip()
    try:
        if "T" in s or " " in s:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return dt.hour
        if ":" in s:
            return int(s.split(":", 1)[0])
    except (ValueError, IndexError):
        return None
    return None


def score_flight_and_deal_taste(
    package: dict[str, Any],
    user_preferences: dict[str, Any] | None = None,
) -> float:
    """
    Scores a flight/lodging deal package on [0.0, 100.0] using learned flight preferences,
    lodging value, price sensitivity, and deal responsiveness.
    """
    discount_pct = float(package.get("discount_pct") or 0.0)
    score = 50.0 + min(25.0, discount_pct * 0.6)

    if not user_preferences or not isinstance(user_preferences, dict):
        return round(max(0.0, min(100.0, score)), 2)

    econ = user_preferences.get("economic_profile") or {}
    if not isinstance(econ, dict):
        econ = {}

    price_sens = float(econ.get("price_sensitivity", 0.5))
    dr = econ.get("deal_responsiveness") or {}
    if isinstance(dr, dict):
        target_disc = float(dr.get("target_discount_pct", 15.0))
        if discount_pct >= target_disc:
            score += min(12.0, (discount_pct - target_disc) * 0.4 + 5.0 * price_sens)
        elif price_sens > 0.65:
            score -= min(12.0, (target_disc - discount_pct) * 0.4)

    fp = econ.get("flight_preferences") or {}
    if isinstance(fp, dict):
        airline_affs = fp.get("airline_affinities") or {}
        flight_obj = (
            package.get("flight") if isinstance(package.get("flight"), dict) else {}
        )
        airline = str(flight_obj.get("airline") or "").strip().lower()
        if airline and isinstance(airline_affs, dict) and airline in airline_affs:
            score += (float(airline_affs[airline]) - 0.5) * 30.0

        dep_win = fp.get("preferred_departure_window")
        dep_hr = _extract_hour(flight_obj.get("depart_time"))
        if (
            isinstance(dep_win, (list, tuple))
            and len(dep_win) == 2
            and dep_hr is not None
        ):
            h_min, h_max = int(dep_win[0]), int(dep_win[1])
            if h_min <= dep_hr <= h_max:
                score += 12.0
            else:
                dist_hr = min(abs(dep_hr - h_min), abs(dep_hr - h_max))
                score -= min(14.0, dist_hr * 2.5)

        direct_bias = float(fp.get("direct_flight_bias", 0.5))
        raw_stops = flight_obj.get("stops")
        if raw_stops is None and isinstance(flight_obj.get("segments"), list):
            raw_stops = max(0, len(flight_obj["segments"]) - 1)
        if raw_stops is not None and abs(direct_bias - 0.5) > 0.05:
            stops_count = int(raw_stops)
            if stops_count == 0:
                score += (direct_bias - 0.5) * 20.0
            else:
                score -= (direct_bias - 0.5) * 16.0 * min(2, stops_count)

    lodging = package.get("lodging")
    if isinstance(lodging, dict):
        lp = econ.get("lodging_preferences") or {}
        discarded_ids = set(str(x) for x in (lp.get("discarded_property_ids") or []))
        if lodging.get("property_id") and str(lodging["property_id"]) in discarded_ids:
            score -= 35.0
        if lodging.get("value_score") is not None:
            score += (float(lodging["value_score"]) - 50.0) * 0.25

    return round(max(0.0, min(100.0, score)), 2)
