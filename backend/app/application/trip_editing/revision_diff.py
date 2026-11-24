from __future__ import annotations

import copy
from typing import Any


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _clean_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _format_number(value: Any) -> str:
    if value is None or value == "":
        return ""
    try:
        num = float(value)
        if num.is_integer():
            return str(int(num))
        return f"{num:.2f}".rstrip("0").rstrip(".")
    except (TypeError, ValueError):
        return str(value)


def _format_status(value: Any) -> str:
    raw = _clean_str(value)
    if not raw:
        return "Active"
    return raw.replace("_", " ").title()


def _extract_explicit_title(itin: dict[str, Any]) -> str:
    tc = _as_dict(itin.get("travel_constraints"))
    return _clean_str(itin.get("title") or tc.get("title"))


def extract_trip_title(
    itin: dict[str, Any] | None, meta: dict[str, Any] | None = None
) -> str:
    itin_d = _as_dict(itin)
    meta_d = _as_dict(meta)
    tc = _as_dict(itin_d.get("travel_constraints"))
    return (
        _clean_str(itin_d.get("title"))
        or _clean_str(tc.get("title"))
        or _clean_str(meta_d.get("destination"))
        or _clean_str(itin_d.get("destination"))
        or "Expedition"
    )


def _extract_corridor(
    itin: dict[str, Any], meta: dict[str, Any]
) -> tuple[str, str, str, str, str, str]:
    tc = _as_dict(itin.get("travel_constraints"))
    origin_city = _clean_str(tc.get("origin_city") or itin.get("origin"))
    origin_iata = _clean_str(tc.get("origin_iata") or itin.get("origin_iata")).upper()
    dest_city = _clean_str(
        tc.get("destination_city") or meta.get("destination") or itin.get("destination")
    )
    dest_iata = _clean_str(
        tc.get("destination_iata") or itin.get("destination_iata")
    ).upper()
    dep_hr = _clean_str(tc.get("departure_hour") or itin.get("departure_hour"))
    arr_hr = _clean_str(tc.get("arrival_hour") or itin.get("arrival_hour"))
    return (origin_city, origin_iata, dest_city, dest_iata, dep_hr, arr_hr)


def _format_corridor_label(
    origin_city: str,
    origin_iata: str,
    dest_city: str,
    dest_iata: str,
    dep_hr: str,
    arr_hr: str,
) -> str:
    left = origin_city or origin_iata or "Origin"
    if origin_city and origin_iata:
        left = f"{origin_city} ({origin_iata})"
    right = dest_city or dest_iata or "Destination"
    if dest_city and dest_iata:
        right = f"{dest_city} ({dest_iata})"
    route = f"{left} -> {right}" if (origin_city or origin_iata) else right
    if dep_hr or arr_hr:
        return f"{route} ({dep_hr or '--:--'} / {arr_hr or '--:--'})"
    return route


def _extract_hotel_state(itin: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    tc = _as_dict(itin.get("travel_constraints"))
    hotel_obj = _as_dict(itin.get("hotel")) or _as_dict(tc.get("hotel"))
    name = _clean_str(
        hotel_obj.get("name") or tc.get("accommodation") or itin.get("accommodation")
    )
    normalized = {
        "name": name,
        "address": _clean_str(hotel_obj.get("address")),
        "check_in_date": _clean_str(hotel_obj.get("check_in_date")),
        "check_out_date": _clean_str(hotel_obj.get("check_out_date")),
        "check_in_time": _clean_str(hotel_obj.get("check_in_time")),
        "check_out_time": _clean_str(hotel_obj.get("check_out_time")),
    }
    return name, normalized


def _extract_budget(itin: dict[str, Any]) -> tuple[float | None, str]:
    tc = _as_dict(itin.get("travel_constraints"))
    raw_val = tc.get("budget_usd")
    if raw_val is None:
        raw_val = itin.get("budget")
    budget_val: float | None = None
    if raw_val is not None and raw_val != "":
        try:
            budget_val = float(raw_val)
        except (TypeError, ValueError):
            budget_val = None
    currency = _clean_str(tc.get("currency") or itin.get("currency") or "EUR").upper()
    return budget_val, currency


def _extract_photo_key(val: Any) -> str:
    if isinstance(val, str):
        return val.strip()
    if isinstance(val, dict):
        for key in ("url", "src", "path"):
            if isinstance(val.get(key), str) and val[key].strip():
                return val[key].strip()
    return ""


def _extract_photos_signature(itin: dict[str, Any]) -> tuple[str, list[str]]:
    cover = _extract_photo_key(itin.get("cover_photo") or itin.get("photo_url"))
    raw_list = itin.get("photos")
    photos: list[str] = []
    if isinstance(raw_list, list):
        for item in raw_list:
            key = _extract_photo_key(item)
            if key:
                photos.append(key)
    if not cover and photos:
        cover = photos[0]
    return cover, photos


def _stop_identifier(stop: Any) -> tuple[str, str]:
    if not isinstance(stop, dict):
        return ("", "Stop")
    poi = _as_dict(stop.get("poi"))
    name = _clean_str(poi.get("name") or stop.get("name")) or "Stop"
    sid = _clean_str(stop.get("id") or poi.get("id") or name)
    return (sid, name)


def _diff_itinerary_days(
    before_itin: dict[str, Any], after_itin: dict[str, Any]
) -> list[dict[str, Any]]:
    b_days = before_itin.get("days")
    a_days = after_itin.get("days")
    if not isinstance(b_days, list) and not isinstance(a_days, list):
        return []
    b_list = b_days if isinstance(b_days, list) else []
    a_list = a_days if isinstance(a_days, list) else []

    b_by_num = {
        int(d.get("day", idx + 1)): d
        for idx, d in enumerate(b_list)
        if isinstance(d, dict)
    }
    a_by_num = {
        int(d.get("day", idx + 1)): d
        for idx, d in enumerate(a_list)
        if isinstance(d, dict)
    }

    changes: list[dict[str, Any]] = []
    for day_num in sorted(set(a_by_num.keys()) - set(b_by_num.keys())):
        changes.append(
            {
                "kind": "itinerary",
                "verb": "added",
                "after_label": f"Day {day_num}",
                "field": "days",
            }
        )
    for day_num in sorted(set(b_by_num.keys()) - set(a_by_num.keys())):
        changes.append(
            {
                "kind": "itinerary",
                "verb": "removed",
                "after_label": f"Day {day_num}",
                "field": "days",
            }
        )

    for day_num in sorted(set(b_by_num.keys()) & set(a_by_num.keys())):
        b_day = b_by_num[day_num]
        a_day = a_by_num[day_num]
        b_path = _as_dict(b_day.get("itinerary")).get("path") or []
        a_path = _as_dict(a_day.get("itinerary")).get("path") or []
        if not isinstance(b_path, list) or not isinstance(a_path, list):
            continue

        b_items = [_stop_identifier(s) for s in b_path]
        a_items = [_stop_identifier(s) for s in a_path]
        b_ids = [item[0] for item in b_items]
        a_ids = [item[0] for item in a_items]

        b_set = set(b_ids)
        a_set = set(a_ids)
        added = [name for sid, name in a_items if sid not in b_set]
        removed = [name for sid, name in b_items if sid not in a_set]

        for name in added[:3]:
            changes.append(
                {
                    "kind": "itinerary",
                    "verb": "added",
                    "after_label": name,
                    "connector": "in",
                    "target_label": f"Day {day_num}",
                    "field": "itinerary",
                }
            )
        for name in removed[:3]:
            changes.append(
                {
                    "kind": "itinerary",
                    "verb": "removed",
                    "after_label": name,
                    "connector": "from",
                    "target_label": f"Day {day_num}",
                    "field": "itinerary",
                }
            )
        if not added and not removed:
            if b_ids != a_ids:
                changes.append(
                    {
                        "kind": "move",
                        "verb": "reordered stops in",
                        "after_label": f"Day {day_num}",
                        "field": "itinerary",
                    }
                )
            elif b_path != a_path:
                changes.append(
                    {
                        "kind": "itinerary",
                        "verb": "edited schedule in",
                        "after_label": f"Day {day_num}",
                        "field": "itinerary",
                    }
                )

        b_theme = (b_day.get("theme") or "").strip()
        a_theme = (a_day.get("theme") or "").strip()
        if b_theme != a_theme:
            changes.append(
                {
                    "kind": "itinerary",
                    "verb": "renamed",
                    "before_label": b_theme or f"Day {day_num}",
                    "after_label": a_theme or f"Day {day_num}",
                    "connector": "for",
                    "target_label": f"Day {day_num}",
                    "field": "theme",
                }
            )
    return changes


def _format_change_sentence(item: dict[str, Any]) -> str:
    verb = _clean_str(item.get("verb"))
    before_label = _clean_str(item.get("before_label"))
    connector = _clean_str(item.get("connector"))
    after_label = _clean_str(item.get("after_label"))
    target_label = _clean_str(item.get("target_label"))

    parts: list[str] = []
    if verb:
        parts.append(verb)
    if before_label and connector:
        parts.append(before_label)
        parts.append(connector)
        if after_label:
            parts.append(after_label)
    else:
        if after_label:
            parts.append(after_label)
        if connector and target_label:
            parts.append(connector)
            parts.append(target_label)
    return " ".join(parts).strip()


def compute_revision_changes(
    before_itin: dict[str, Any] | None,
    after_itin: dict[str, Any] | None,
    before_meta: dict[str, Any] | None = None,
    after_meta: dict[str, Any] | None = None,
) -> tuple[str, str, list[dict[str, Any]]]:
    b_itin = _as_dict(before_itin)
    a_itin = _as_dict(after_itin)
    b_meta = _as_dict(before_meta)
    a_meta = _as_dict(after_meta)
    b_tc = _as_dict(b_itin.get("travel_constraints"))
    a_tc = _as_dict(a_itin.get("travel_constraints"))

    changes: list[dict[str, Any]] = []
    after_title = extract_trip_title(a_itin, a_meta)

    # 1. Status
    b_status = _clean_str(b_meta.get("status") or b_itin.get("status") or "active")
    a_status = _clean_str(a_meta.get("status") or a_itin.get("status") or "active")
    if b_status and a_status and b_status.lower() != a_status.lower():
        changes.append(
            {
                "kind": "status",
                "verb": "changed status from",
                "before_label": _format_status(b_status),
                "connector": "to",
                "after_label": _format_status(a_status),
                "field": "status",
            }
        )

    # 2. Title
    b_explicit_title = _extract_explicit_title(b_itin)
    a_explicit_title = _extract_explicit_title(a_itin)
    if a_explicit_title != b_explicit_title and (a_explicit_title or b_explicit_title):
        old_title_label = b_explicit_title or extract_trip_title(b_itin, b_meta)
        new_title_label = a_explicit_title or extract_trip_title(a_itin, a_meta)
        if old_title_label != new_title_label:
            changes.append(
                {
                    "kind": "title",
                    "verb": "changed the title to",
                    "before_label": old_title_label,
                    "after_label": new_title_label,
                    "field": "title",
                }
            )

    # 3. Destination
    b_dest = _clean_str(
        b_meta.get("destination")
        or b_itin.get("destination")
        or b_tc.get("destination_city")
    )
    a_dest = _clean_str(
        a_meta.get("destination")
        or a_itin.get("destination")
        or a_tc.get("destination_city")
    )
    if (b_dest or a_dest) and b_dest != a_dest:
        changes.append(
            {
                "kind": "route",
                "verb": "changed destination from",
                "before_label": b_dest or "Unset",
                "connector": "to",
                "after_label": a_dest or "Unset",
                "field": "destination",
            }
        )

    # 4. Origin / Flight Corridor / Hours
    b_corridor = _extract_corridor(b_itin, b_meta)
    a_corridor = _extract_corridor(a_itin, a_meta)
    # Exclude destination city alone (already tracked above)
    b_corridor_sans_dest = (
        b_corridor[0],
        b_corridor[1],
        b_corridor[3],
        b_corridor[4],
        b_corridor[5],
    )
    a_corridor_sans_dest = (
        a_corridor[0],
        a_corridor[1],
        a_corridor[3],
        a_corridor[4],
        a_corridor[5],
    )
    if b_corridor_sans_dest != a_corridor_sans_dest:
        changes.append(
            {
                "kind": "route",
                "verb": "updated transit corridor to",
                "before_label": _format_corridor_label(*b_corridor),
                "after_label": _format_corridor_label(*a_corridor),
                "field": "route",
            }
        )

    # 5. Lodging Anchor / Hotel
    b_hotel_name, b_hotel_norm = _extract_hotel_state(b_itin)
    a_hotel_name, a_hotel_norm = _extract_hotel_state(a_itin)
    if b_hotel_norm != a_hotel_norm:
        if a_hotel_name:
            changes.append(
                {
                    "kind": "hotel",
                    "verb": "updated lodging anchor to",
                    "before_label": b_hotel_name or None,
                    "after_label": a_hotel_name,
                    "field": "hotel",
                }
            )
        else:
            changes.append(
                {
                    "kind": "hotel",
                    "verb": "cleared lodging anchor",
                    "before_label": b_hotel_name or None,
                    "after_label": b_hotel_name or "Lodging",
                    "field": "hotel",
                }
            )

    # 6. Budget & Currency
    b_budget, b_curr = _extract_budget(b_itin)
    a_budget, a_curr = _extract_budget(a_itin)
    if b_budget != a_budget or b_curr != a_curr:
        if b_budget is not None and a_budget is not None:
            changes.append(
                {
                    "kind": "budget",
                    "verb": "changed target budget from",
                    "before_label": f"{_format_number(b_budget)} {b_curr}",
                    "connector": "to",
                    "after_label": f"{_format_number(a_budget)} {a_curr}",
                    "field": "budget",
                }
            )
        elif a_budget is not None:
            changes.append(
                {
                    "kind": "budget",
                    "verb": "set target budget to",
                    "after_label": f"{_format_number(a_budget)} {a_curr}",
                    "field": "budget",
                }
            )
        elif b_budget is not None:
            changes.append(
                {
                    "kind": "budget",
                    "verb": "cleared target budget",
                    "before_label": f"{_format_number(b_budget)} {b_curr}",
                    "after_label": f"{_format_number(b_budget)} {b_curr}",
                    "field": "budget",
                }
            )
        else:
            changes.append(
                {
                    "kind": "budget",
                    "verb": "changed base currency from",
                    "before_label": b_curr,
                    "connector": "to",
                    "after_label": a_curr,
                    "field": "currency",
                }
            )

    # 7. Timeline Dates
    b_start = _clean_str(b_meta.get("start_date") or b_tc.get("start_date"))
    b_end = _clean_str(b_meta.get("end_date") or b_tc.get("end_date"))
    a_start = _clean_str(a_meta.get("start_date") or a_tc.get("start_date"))
    a_end = _clean_str(a_meta.get("end_date") or a_tc.get("end_date"))
    if (b_start or b_end or a_start or a_end) and (b_start, b_end) != (a_start, a_end):
        changes.append(
            {
                "kind": "dates",
                "verb": "moved expedition dates to",
                "before_label": f"{b_start} – {b_end}".strip(" –"),
                "after_label": f"{a_start} – {a_end}".strip(" –"),
                "field": "dates",
            }
        )

    # 8. Exploration Pace
    b_pace = _clean_str(b_tc.get("pace"))
    a_pace = _clean_str(a_tc.get("pace"))
    if a_pace and b_pace != a_pace:
        changes.append(
            {
                "kind": "pace",
                "verb": "changed exploration pace from",
                "before_label": (b_pace or "balanced").title(),
                "connector": "to",
                "after_label": a_pace.title(),
                "field": "pace",
            }
        )

    # 9. Cover Photo
    b_cover, b_photos = _extract_photos_signature(b_itin)
    a_cover, a_photos = _extract_photos_signature(a_itin)
    if b_cover != a_cover or b_photos != a_photos:
        changes.append(
            {
                "kind": "photo",
                "verb": "updated cover media for",
                "after_label": after_title,
                "field": "photo",
            }
        )

    # 10. Description & Notes
    b_desc = _clean_str(b_itin.get("description"))
    a_desc = _clean_str(a_itin.get("description"))
    if b_desc != a_desc:
        changes.append(
            {
                "kind": "notes",
                "verb": "edited field briefing for",
                "after_label": after_title,
                "field": "description",
            }
        )

    b_notes = _clean_str(b_itin.get("notes"))
    a_notes = _clean_str(a_itin.get("notes"))
    if b_notes != a_notes:
        changes.append(
            {
                "kind": "notes",
                "verb": "edited internal notes for",
                "after_label": after_title,
                "field": "notes",
            }
        )

    # 11. Itinerary Days & Stops
    changes.extend(_diff_itinerary_days(b_itin, a_itin))

    if not changes:
        changes.append(
            {
                "kind": "edit",
                "verb": "edited the",
                "after_label": after_title,
                "field": "itinerary_data",
            }
        )

    lead_kind = str(changes[0].get("kind") or "edit")
    summary_parts = [_format_change_sentence(item) for item in changes[:3]]
    if len(changes) > 3:
        summary_parts.append(f"+{len(changes) - 3} more")
    summary = (
        "; ".join(part for part in summary_parts if part) or f"edited the {after_title}"
    )
    # Capitalize the summary first character
    summary = summary[0].upper() + summary[1:] if summary else f"Edited {after_title}"
    return lead_kind, summary, changes


def apply_inverse_change(
    current_itin: dict[str, Any] | None,
    current_meta: dict[str, Any] | None,
    rev_before_itin: dict[str, Any] | None,
    rev_after_itin: dict[str, Any] | None,
    rev_before_meta: dict[str, Any] | None = None,
    rev_after_meta: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    patched_itin = copy.deepcopy(_as_dict(current_itin))
    patched_meta = copy.deepcopy(_as_dict(current_meta))

    b_itin = _as_dict(rev_before_itin)
    a_itin = _as_dict(rev_after_itin)
    b_meta = _as_dict(rev_before_meta)
    a_meta = _as_dict(rev_after_meta)

    reverted_labels: list[str] = []

    for meta_key in ("destination", "start_date", "end_date", "status"):
        if (meta_key in b_meta or meta_key in a_meta) and b_meta.get(
            meta_key
        ) != a_meta.get(meta_key):
            if meta_key in b_meta and b_meta.get(meta_key) is not None:
                patched_meta[meta_key] = copy.deepcopy(b_meta[meta_key])
                reverted_labels.append(meta_key)

    for key in sorted(set(b_itin.keys()) | set(a_itin.keys())):
        if key == "travel_constraints":
            b_tc = _as_dict(b_itin.get("travel_constraints"))
            a_tc = _as_dict(a_itin.get("travel_constraints"))
            if b_tc != a_tc:
                cur_tc = copy.deepcopy(_as_dict(patched_itin.get("travel_constraints")))
                for sk in sorted(set(b_tc.keys()) | set(a_tc.keys())):
                    if b_tc.get(sk) != a_tc.get(sk):
                        if sk in b_tc:
                            cur_tc[sk] = copy.deepcopy(b_tc[sk])
                        else:
                            cur_tc.pop(sk, None)
                        reverted_labels.append(f"travel_constraints.{sk}")
                patched_itin["travel_constraints"] = cur_tc
        elif b_itin.get(key) != a_itin.get(key):
            if key in b_itin:
                patched_itin[key] = copy.deepcopy(b_itin[key])
            else:
                patched_itin.pop(key, None)
            reverted_labels.append(key)

    return patched_itin, patched_meta, reverted_labels
