import math
from typing import Any


def _euclidean_dist(p1: tuple[float, float], p2: tuple[float, float]) -> float:
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])


def calculate_zigzag_ratio(coords: list[tuple[float, float]]) -> float:
    """
    Computes zigzag ratio = actual_path_distance / two_opt_lower_bound_distance.
    If the path is already optimal, returns ~1.0. A value > 1.25 indicates significant back-and-forth oscillation.
    """
    n = len(coords)
    if n <= 2:
        return 1.0

    actual_dist = sum(_euclidean_dist(coords[i], coords[i + 1]) for i in range(n - 1))
    if actual_dist < 1e-6:
        return 1.0

    # Fast 2-opt heuristic to approximate the optimal path with fixed start (coords[0])
    best_route = list(range(n))
    improved = True
    while improved:
        improved = False
        for i in range(1, n - 1):
            for j in range(i + 1, n):
                # Reverse segment between i and j
                cur_dist = _euclidean_dist(
                    coords[best_route[i - 1]], coords[best_route[i]]
                )
                if j + 1 < n:
                    cur_dist += _euclidean_dist(
                        coords[best_route[j]], coords[best_route[j + 1]]
                    )
                new_dist = _euclidean_dist(
                    coords[best_route[i - 1]], coords[best_route[j]]
                )
                if j + 1 < n:
                    new_dist += _euclidean_dist(
                        coords[best_route[i]], coords[best_route[j + 1]]
                    )

                if new_dist < cur_dist - 1e-6:
                    best_route[i : j + 1] = reversed(best_route[i : j + 1])
                    improved = True

    opt_dist = sum(
        _euclidean_dist(coords[best_route[k]], coords[best_route[k + 1]])
        for k in range(n - 1)
    )
    if opt_dist < 1e-6:
        return 1.0

    return max(1.0, actual_dist / opt_dist)


def evaluate_tier1_recall(scheduled_names: list[str], tier1_seed: list[str]) -> float:
    """Computes the recall fraction of Tier 1 seed POIs present in the scheduled itinerary."""
    if not tier1_seed:
        return 1.0
    sched_lower = [name.strip().lower() for name in scheduled_names]
    matched = 0
    for t1 in tier1_seed:
        t1_low = t1.strip().lower()
        if any(t1_low in s or s in t1_low for s in sched_lower):
            matched += 1
    return matched / len(tier1_seed)


def detect_closure_violations(scheduled_nodes: list[dict[str, Any]]) -> int:
    """
    Checks for visits to POIs when they are closed or outside their operating hours.
    """
    violations = 0
    for node in scheduled_nodes:
        weekday = node.get("weekday", 0)
        open_hours = node.get("open_time_mins_by_day")
        close_hours = node.get("close_time_mins_by_day")
        if open_hours and close_hours:
            if weekday < len(open_hours) and weekday < len(close_hours):
                o_time = open_hours[weekday]
                c_time = close_hours[weekday]
                if o_time == -1 or c_time == -1:
                    violations += 1
                    continue
                arr = node.get("arrival_time_mins")
                dep = node.get("departure_time_mins")
                if arr is not None and dep is not None:
                    if arr < o_time or dep > c_time:
                        violations += 1
    return violations


def detect_meal_spacing_violations(scheduled_nodes: list[dict[str, Any]]) -> int:
    """
    Checks for meal realism violations (meals spaced < 180 min apart or outside allowable meal windows).
    """
    violations = 0
    meals = [n for n in scheduled_nodes if n.get("is_meal")]
    for i in range(len(meals) - 1):
        t1 = meals[i].get("arrival_time_mins", 0)
        t2 = meals[i + 1].get("arrival_time_mins", 0)
        if t2 - t1 < 180:
            violations += 1
    return violations


def detect_idle_time_violations(
    daily_idle_mins: list[int], max_idle_threshold: int = 45
) -> int:
    """Counts days where total accumulated idle time exceeds the threshold."""
    return sum(1 for idle in daily_idle_mins if idle > max_idle_threshold)


def calculate_load_variance(daily_loads: list[float | int]) -> float:
    """Computes the sample variance of daily active loads (time in minutes or POI count)."""
    if len(daily_loads) <= 1:
        return 0.0
    mean = sum(daily_loads) / len(daily_loads)
    return sum((x - mean) ** 2 for x in daily_loads) / (len(daily_loads) - 1)


def calculate_category_entropy(categories: list[str]) -> float:
    """Computes Shannon entropy (base 2) of the scheduled categories."""
    if not categories:
        return 0.0
    counts: dict[str, int] = {}
    for c in categories:
        c_clean = c.strip().lower()
        if c_clean:
            counts[c_clean] = counts.get(c_clean, 0) + 1
    total = sum(counts.values())
    if total <= 1:
        return 0.0
    entropy = 0.0
    for cnt in counts.values():
        p = cnt / total
        if p > 0:
            entropy -= p * math.log2(p)
    return entropy


def calculate_budget_overrun(total_cost: float, max_budget: float) -> float:
    """Returns percentage by which total cost exceeds max budget."""
    if max_budget <= 0:
        return 0.0
    if total_cost <= max_budget:
        return 0.0
    return ((total_cost - max_budget) / max_budget) * 100.0
