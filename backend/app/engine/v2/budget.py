"""Budget Allocation and Slack Redistribution for Paladio Itinerary v2.

Implements pro-rata daily budget allocation, single FX conversion function
(Amendment A6), and dynamic unspent slack redistribution across trip days.
"""

from collections.abc import Sequence

from app.engine.v2.currency import convert_currency, get_cached_rate
from app.engine.v2.day_assignment import AssignedDay


def allocate_trip_budget(
    assigned_days: Sequence[AssignedDay],
    total_budget_usd: float | None = None,
    exchange_rate: float | None = None,
    daily_meal_buffer_eur: float = 25.0,
) -> list[AssignedDay]:
    """Allocates total trip budget pro-rata based on planned daily POI and meal costs."""
    if exchange_rate is None:
        exchange_rate = get_cached_rate("USD", "EUR") or 1.0
    k = len(assigned_days)
    if k == 0:
        return []

    # If no budget specified, allocate generous default (150 EUR/day)
    if total_budget_usd is None or total_budget_usd <= 0:
        for day in assigned_days:
            day.daily_budget_eur = 150.0
        return list(assigned_days)

    total_budget_eur = convert_currency(
        total_budget_usd,
        from_currency="USD",
        to_currency="EUR",
        exchange_rate=exchange_rate,
    )

    # Calculate expected base costs per day
    expected_costs = [
        sum(p.poi.cost_eur for p in d.pois) + daily_meal_buffer_eur
        for d in assigned_days
    ]
    total_expected = sum(expected_costs)

    if total_expected <= 0:
        daily_share = round(total_budget_eur / k, 2)
        for day in assigned_days:
            day.daily_budget_eur = daily_share
    else:
        for idx, day in enumerate(assigned_days):
            pro_rata = (expected_costs[idx] / total_expected) * total_budget_eur
            day.daily_budget_eur = round(max(15.0, pro_rata), 2)

    return list(assigned_days)


def redistribute_budget_slack(
    unspent_eur: float,
    subsequent_days: Sequence[AssignedDay],
) -> None:
    """Redistributes unspent budget from an earlier day pro-rata to remaining days."""
    if unspent_eur <= 0 or not subsequent_days:
        return

    n_rem = len(subsequent_days)
    share = round(unspent_eur / n_rem, 2)
    for day in subsequent_days:
        day.daily_budget_eur = round(day.daily_budget_eur + share, 2)
