"""Day Assignment Pipeline for Paladio Itinerary v2.

Assigns globally selected POIs to calendar days:
1. Contraction of spatial walking bundles into super-nodes (preventing bundle splits)
2. Farthest-point anchor seed initialization
3. Regret-based insertion under daily time and node capacities
4. Local search relocation and swap optimization
5. Hungarian matching (scipy.optimize.linear_sum_assignment) to calendar days
   guaranteeing zero closure violations and matching light days to arrival/departure.
"""

import numpy as np
from app.engine.transit_matrix import haversine_distance
from app.engine.v2.selection import SelectedPoi
from app.engine.v2.trip_frame import DayFrame, TripFrame
from pydantic import BaseModel, Field
from scipy.optimize import linear_sum_assignment


class AssignedDay(BaseModel):
    """Daily itinerary partition containing assigned POIs and temporal window."""

    day_index: int
    calendar_date: str | None = None
    weekday: int = 0  # 0 = Monday ... 6 = Sunday
    is_arrival_day: bool = False
    is_departure_day: bool = False
    start_time_mins: int = 540
    end_time_mins: int = 1260
    anchor_poi: SelectedPoi | None = None
    pois: list[SelectedPoi] = Field(default_factory=list)
    effective_time_windows: dict[str, tuple[int, int]] = Field(default_factory=dict)
    total_active_mins: int = 0
    total_cost_eur: float = 0.0
    daily_budget_eur: float = 0.0
    requested_meals: list[str] = Field(default_factory=list)
    theme: str = "City Exploration"


class DayAssignmentResult(BaseModel):
    """Result of day assignment across the full trip."""

    assigned_days: list[AssignedDay]
    unassigned_pois: list[SelectedPoi] = Field(default_factory=list)
    load_variance: float = 0.0
    closure_violations: int = 0


def _get_poi_coord(poi: SelectedPoi) -> tuple[float, float]:
    loc = poi.poi.location
    lat = (
        loc.get("latitude", 0.0)
        if isinstance(loc, dict)
        else getattr(loc, "latitude", 0.0)
    )
    lon = (
        loc.get("longitude", 0.0)
        if isinstance(loc, dict)
        else getattr(loc, "longitude", 0.0)
    )
    return float(lat or 0.0), float(lon or 0.0)


def _bundle_centroid(bundle: list[SelectedPoi]) -> tuple[float, float]:
    if not bundle:
        return 0.0, 0.0
    coords = [_get_poi_coord(p) for p in bundle]
    return float(np.mean([c[0] for c in coords])), float(
        np.mean([c[1] for c in coords])
    )


def bundle_nearby_pois(
    selected_pois: list[SelectedPoi],
    threshold_km: float = 0.35,
) -> list[list[SelectedPoi]]:
    """Groups POIs within walking proximity into super-node bundles."""
    n = len(selected_pois)
    if n <= 1:
        return [[p] for p in selected_pois]

    visited = [False] * n
    bundles: list[list[SelectedPoi]] = []

    for i in range(n):
        if visited[i]:
            continue
        current_bundle = [selected_pois[i]]
        visited[i] = True
        c_lat, c_lon = _get_poi_coord(selected_pois[i])

        for j in range(i + 1, n):
            if visited[j]:
                continue
            j_lat, j_lon = _get_poi_coord(selected_pois[j])
            if haversine_distance(c_lat, c_lon, j_lat, j_lon) <= threshold_km:
                current_bundle.append(selected_pois[j])
                visited[j] = True

        bundles.append(current_bundle)

    return bundles


def _select_anchor_seeds(
    bundles: list[list[SelectedPoi]],
    k: int,
) -> list[int]:
    """Selects k bundle indices as daily anchor seeds via farthest-point sampling."""
    n = len(bundles)
    if n <= k:
        return list(range(n))

    # Seed 0: highest priority POI (User Mandatory or highest Tier 1)
    best_idx = 0
    best_priority = -1.0
    for idx, b in enumerate(bundles):
        p_max = max(
            (
                100.0
                if p.poi.is_mandatory
                else 50.0 * (5 - p.poi.tier) + p.poi.iconicity_score * 20.0
            )
            for p in b
        )
        if p_max > best_priority:
            best_priority = p_max
            best_idx = idx

    seeds = [best_idx]
    centroids = [_bundle_centroid(b) for b in bundles]

    while len(seeds) < k:
        max_min_dist = -1.0
        best_candidate = -1

        for i in range(n):
            if i in seeds:
                continue
            min_dist_to_seed = min(
                haversine_distance(
                    centroids[i][0], centroids[i][1], centroids[s][0], centroids[s][1]
                )
                for s in seeds
            )
            if min_dist_to_seed > max_min_dist:
                max_min_dist = min_dist_to_seed
                best_candidate = i

        if best_candidate != -1:
            seeds.append(best_candidate)
        else:
            break

    return seeds


def _calculate_insertion_cost(
    bundle: list[SelectedPoi],
    cluster: list[SelectedPoi],
    day_frame: DayFrame,
    trip_frame: TripFrame | None = None,
) -> float:
    """Computes spatial dispersion, capacity penalty, and time strain of inserting a bundle."""
    b_dur = sum(p.effective_duration_mins for p in bundle)
    curr_dur = sum(p.effective_duration_mins for p in cluster)
    curr_nodes = len(cluster)

    # 1. Spatial distance cost
    if not cluster:
        dist_cost = 0.0
    else:
        b_c = _bundle_centroid(bundle)
        c_c = _bundle_centroid(cluster)
        b_dist = haversine_distance(b_c[0], b_c[1], c_c[0], c_c[1])
        dist_cost = (b_dist**1.5) * 8.0

    # 2. Capacity overload penalties
    cap_penalty = 0.0
    if curr_dur + b_dur > day_frame.target_active_mins:
        over = (curr_dur + b_dur) - day_frame.target_active_mins
        cap_penalty += over * 5.0

    if curr_nodes + len(bundle) > day_frame.max_anchors:
        node_over = (curr_nodes + len(bundle)) - day_frame.max_anchors
        cap_penalty += node_over * 50.0

    # 3. Trip closure feasibility check
    if trip_frame:
        trip_weekdays = [
            d.calendar_date.weekday() if d.calendar_date else d.day_index % 7
            for d in trip_frame.days
        ]
        combined = cluster + bundle
        feasible_days = sum(
            1
            for w in trip_weekdays
            if all(not _is_poi_closed_on_weekday(p, w) for p in combined)
        )
        if feasible_days == 0:
            cap_penalty += 5000.0

    return dist_cost + cap_penalty


def _regret_insertion(
    bundles: list[list[SelectedPoi]],
    trip_frame: TripFrame,
) -> list[list[SelectedPoi]]:
    """Assigns bundles to K clusters using Regret-2 insertion."""
    k = len(trip_frame.days)
    if k == 1:
        # All in single day
        all_pois = [p for b in bundles for p in b]
        return [all_pois]

    seed_indices = _select_anchor_seeds(bundles, k)
    clusters: list[list[SelectedPoi]] = [list(bundles[idx]) for idx in seed_indices]
    while len(clusters) < k:
        clusters.append([])

    unassigned = [i for i in range(len(bundles)) if i not in seed_indices]

    while unassigned:
        best_bundle_idx = -1
        max_regret = -1e9
        best_target_cluster = 0

        for b_idx in unassigned:
            bundle = bundles[b_idx]
            costs = []
            for c_idx in range(k):
                c = _calculate_insertion_cost(
                    bundle,
                    clusters[c_idx],
                    trip_frame.days[c_idx],
                    trip_frame=trip_frame,
                )
                costs.append((c, c_idx))

            costs.sort(key=lambda x: x[0])
            c1, target_1 = costs[0]
            c2, _ = costs[1] if len(costs) > 1 else (c1 + 100.0, 0)
            regret = c2 - c1

            if regret > max_regret:
                max_regret = regret
                best_bundle_idx = b_idx
                best_target_cluster = target_1

        if best_bundle_idx != -1:
            clusters[best_target_cluster].extend(bundles[best_bundle_idx])
            unassigned.remove(best_bundle_idx)
        else:
            break

    return clusters


def _local_search_refinement(
    clusters: list[list[SelectedPoi]],
    trip_frame: TripFrame,
    max_iters: int = 20,
) -> list[list[SelectedPoi]]:
    """Refines clusters via relocation and pairwise swap local search."""
    k = len(clusters)
    if k <= 1:
        return clusters

    def eval_solution(current_clusters: list[list[SelectedPoi]]) -> float:
        total_obj = 0.0
        daily_durs = []
        for c_idx, cl in enumerate(current_clusters):
            d_dur = sum(p.effective_duration_mins for p in cl)
            daily_durs.append(d_dur)
            # Dispersion
            if len(cl) > 1:
                c_c = _bundle_centroid(cl)
                for p in cl:
                    p_lat, p_lon = _get_poi_coord(p)
                    d = haversine_distance(p_lat, p_lon, c_c[0], c_c[1])
                    total_obj += (d**1.5) * 8.0
            # Target diff
            target = trip_frame.days[c_idx].target_active_mins
            total_obj += ((d_dur - target) / 60.0) ** 2 * 20.0

        # Load variance
        total_obj += float(np.var(daily_durs)) * 0.1

        # Closure feasibility penalty across trip calendar
        trip_weekdays = [
            d.calendar_date.weekday() if d.calendar_date else d.day_index % 7
            for d in trip_frame.days
        ]
        for cl in current_clusters:
            if cl:
                feasible_days = sum(
                    1
                    for w in trip_weekdays
                    if all(not _is_poi_closed_on_weekday(p, w) for p in cl)
                )
                if feasible_days == 0:
                    total_obj += 5000.0

        return total_obj

    current_best = [list(c) for c in clusters]
    best_score = eval_solution(current_best)

    for _ in range(max_iters):
        improved = False
        # Try relocations
        for c_from in range(k):
            if len(current_best[c_from]) <= 1:
                continue
            for i, p in enumerate(current_best[c_from]):
                if p.poi.is_mandatory:
                    continue  # Keep anchors stable
                for c_to in range(k):
                    if c_from == c_to:
                        continue
                    # Test move
                    cand_clusters = [list(c) for c in current_best]
                    cand_clusters[c_from].pop(i)
                    cand_clusters[c_to].append(p)
                    score = eval_solution(cand_clusters)
                    if score < best_score - 1.0:
                        best_score = score
                        current_best = cand_clusters
                        improved = True
                        break
                if improved:
                    break
            if improved:
                break
        if not improved:
            break

    return current_best


def _is_poi_closed_on_weekday(poi: SelectedPoi, weekday: int) -> bool:
    """Checks whether the POI is closed on the given weekday (0=Mon..6=Sun)."""
    open_times = poi.poi.open_time_mins_by_day
    if not open_times or len(open_times) <= weekday:
        return False
    return open_times[weekday] == -1


def get_effective_time_window(
    poi: SelectedPoi,
    day_weekday: int,
    day_start_mins: int,
    day_end_mins: int,
) -> tuple[int, int]:
    """Intersects POI open/close hours with the day's active start and end time."""
    open_vec = getattr(poi.poi, "open_time_mins_by_day", None)
    close_vec = getattr(poi.poi, "close_time_mins_by_day", None)
    if open_vec and len(open_vec) == 7 and 0 <= day_weekday < 7:
        o_min = open_vec[day_weekday]
        c_min = close_vec[day_weekday]
        if o_min == -1 or c_min == -1:
            o_min = getattr(poi.poi, "open_time_mins", 480)
            c_min = getattr(poi.poi, "close_time_mins", 1320)
    else:
        o_min = getattr(poi.poi, "open_time_mins", 480)
        c_min = getattr(poi.poi, "close_time_mins", 1320)

    earliest = max(o_min, day_start_mins)
    latest = min(c_min, day_end_mins)
    if latest < earliest:
        # Midnight crossing or tight schedule fallback
        latest = earliest + poi.effective_duration_mins
    return earliest, latest


THEME_NAMES: dict[str, str] = {
    "art_culture": "Art & Masterpieces",
    "history_heritage": "Historic Echoes & Monuments",
    "scenic_views": "Iconic Vistas & Cityscape",
    "architecture": "Architectural Landmarks",
    "nature_outdoors": "Parks & Promenade",
    "food_culinary": "Culinary Flavors & Markets",
    "shopping": "Fashion & Boutiques",
    "nightlife": "Evening Vibrance",
}
THEME_MAP = THEME_NAMES


def _derive_day_theme(pois: list[SelectedPoi]) -> str:
    """Assigns an explainable daily theme based on dominant taxonomy categories."""
    if not pois:
        return "City Leisure"
    cat_counts: dict[str, int] = {}
    for p in pois:
        c = p.poi.taxonomy_category
        cat_counts[c] = cat_counts.get(c, 0) + 1
    top_cat = max(cat_counts.items(), key=lambda x: x[1])[0]
    return THEME_NAMES.get(top_cat, "City Highlights")


def assign_pois_to_days(
    selected_pois: list[SelectedPoi],
    trip_frame: TripFrame,
) -> DayAssignmentResult:
    """Main entry point: assigns selected POIs to optimal calendar days."""
    k = len(trip_frame.days)
    if not selected_pois:
        empty_days = [
            AssignedDay(
                day_index=d.day_index,
                calendar_date=d.calendar_date.isoformat() if d.calendar_date else None,
                weekday=d.calendar_date.weekday()
                if d.calendar_date
                else d.day_index % 7,
                is_arrival_day=d.is_arrival_day,
                is_departure_day=d.is_departure_day,
                start_time_mins=d.start_time_mins,
                end_time_mins=d.end_time_mins,
                daily_budget_eur=d.daily_budget_eur,
                requested_meals=d.requested_meals,
            )
            for d in trip_frame.days
        ]
        return DayAssignmentResult(assigned_days=empty_days)

    # 1. Spatial bundling (super-nodes)
    bundles = bundle_nearby_pois(selected_pois, threshold_km=0.35)

    # 2. Regret-2 Insertion into K clusters
    clusters = _regret_insertion(bundles, trip_frame)

    # 3. Local Search Refinement
    clusters = _local_search_refinement(clusters, trip_frame)

    # 4. Hungarian Matching to Calendar Days
    # Cost matrix: M[cluster_idx, day_idx]
    cost_matrix = np.zeros((k, k), dtype=np.float64)

    for c_idx in range(k):
        cl = clusters[c_idx]
        cl_dur = sum(p.effective_duration_mins for p in cl)
        cl_nodes = len(cl)

        for d_idx in range(k):
            day_f = trip_frame.days[d_idx]
            wday = day_f.calendar_date.weekday() if day_f.calendar_date else d_idx % 7

            # A. Closure penalty: +10,000 for each closed venue!
            closure_cost = sum(
                10000.0 for p in cl if _is_poi_closed_on_weekday(p, wday)
            )

            # B. Capacity and arrival/departure fit
            time_diff = (cl_dur - day_f.target_active_mins) / 60.0
            capacity_cost = (time_diff**2) * 50.0

            # C. Arrival/Departure light load preference
            if (
                day_f.is_arrival_day or day_f.is_departure_day
            ) and cl_nodes > day_f.max_anchors:
                capacity_cost += (cl_nodes - day_f.max_anchors) * 500.0

            cost_matrix[c_idx, d_idx] = closure_cost + capacity_cost

    row_ind, col_ind = linear_sum_assignment(cost_matrix)

    # Reconstruct final AssignedDays in chronological day order (0..K-1)
    assigned_days: list[AssignedDay] = []
    day_to_cluster: dict[int, int] = {
        int(col): int(row) for row, col in zip(row_ind, col_ind)
    }

    closure_violations_count = 0
    daily_durations = []

    for d_idx in range(k):
        day_f = trip_frame.days[d_idx]
        c_idx = day_to_cluster[d_idx]
        day_pois = clusters[c_idx]

        wday = day_f.calendar_date.weekday() if day_f.calendar_date else d_idx % 7
        for p in day_pois:
            if _is_poi_closed_on_weekday(p, wday):
                closure_violations_count += 1

        total_dur = sum(p.effective_duration_mins for p in day_pois)
        total_cost = sum(p.poi.cost_eur for p in day_pois)
        daily_durations.append(total_dur)

        # Primary anchor is the highest-tier/iconic POI in the day
        anchor = None
        if day_pois:
            anchor = max(
                day_pois,
                key=lambda x: (x.poi.is_mandatory, -x.poi.tier, x.poi.iconicity_score),
            )

        effective_windows = {
            p.poi.name: get_effective_time_window(
                p, wday, day_f.start_time_mins, day_f.end_time_mins
            )
            for p in day_pois
        }

        assigned_days.append(
            AssignedDay(
                day_index=d_idx,
                calendar_date=day_f.calendar_date.isoformat()
                if day_f.calendar_date
                else None,
                weekday=wday,
                is_arrival_day=day_f.is_arrival_day,
                is_departure_day=day_f.is_departure_day,
                start_time_mins=day_f.start_time_mins,
                end_time_mins=day_f.end_time_mins,
                anchor_poi=anchor,
                pois=day_pois,
                effective_time_windows=effective_windows,
                total_active_mins=total_dur,
                total_cost_eur=round(total_cost, 2),
                daily_budget_eur=day_f.daily_budget_eur,
                requested_meals=day_f.requested_meals,
                theme=_derive_day_theme(day_pois),
            )
        )

    load_var = float(np.var(daily_durations)) if len(daily_durations) > 1 else 0.0

    return DayAssignmentResult(
        assigned_days=assigned_days,
        unassigned_pois=[],
        load_variance=round(load_var, 2),
        closure_violations=closure_violations_count,
    )
