from __future__ import annotations

import logging
from typing import Any

from app.domain.entities.poi import Poi, PoiLocation
from app.domain.interfaces.poi_repository import IPoiRepository
from app.engine.v2.tiering import classify_poi_tier

logger = logging.getLogger(__name__)


class InMemoryPoiRepository(IPoiRepository):
    """Hermetic, in-memory POI repository implementing IPoiRepository.

    Used by benchmark harnesses, test suites, and offline executions where
    a live database connection is not needed or when mock POIs are injected.
    """

    def __init__(
        self,
        pois: list[Poi | dict[str, Any]] | None = None,
        city: str = "",
    ):
        self.city = city
        self.pois: list[Poi] = []
        if pois:
            for p in pois:
                if isinstance(p, Poi):
                    self.pois.append(p)
                elif isinstance(p, dict):
                    self.pois.append(self._dict_to_poi(p, city))

    def _dict_to_poi(self, d: dict[str, Any], default_city: str) -> Poi:
        c_city = d.get("city") or default_city or "Unknown"
        tier_info = classify_poi_tier(d, c_city)
        loc = d.get("location") or {}
        lat = loc.get("latitude", d.get("lat", 0.0))
        lon = loc.get("longitude", d.get("lon", 0.0))

        raw_cost = d.get("cost_eur")
        if raw_cost is None and isinstance(d.get("financials"), dict):
            raw_cost = d["financials"].get("estimated_cost", 0.0)
        cost_val = float(raw_cost) if raw_cost is not None else 0.0

        open_vec = d.get("open_time_mins_by_day") or [480] * 7
        close_vec = d.get("close_time_mins_by_day") or [1320] * 7

        return Poi(
            id=str(d.get("id") or d.get("poi_id") or d.get("name")),
            name=d.get("name", "Unnamed POI"),
            city=c_city,
            category=d.get("category", "ATTRACTION"),
            location=PoiLocation(latitude=float(lat), longitude=float(lon)),
            open_time_mins_by_day=open_vec,
            close_time_mins_by_day=close_vec,
            duration_mins=int(d.get("duration_mins", d.get("duration", 60))),
            cost_eur=cost_val,
            tier=tier_info["tier"],
            tier_confidence=tier_info["tier_confidence"],
            tier_source=tier_info["tier_source"],
            iconicity_score=tier_info["iconicity_score"],
            taxonomy_category=tier_info["taxonomy_category"],
            category_id=tier_info["category_id"],
            visit_mode=tier_info["visit_mode"],
        )

    async def find_by_city(self, city_name: str) -> list[Poi]:
        c_clean = city_name.strip().lower()
        return [p for p in self.pois if p.city.lower() == c_clean]

    async def find_tiered_pois(self, city_name: str, max_tier: int = 2) -> list[Poi]:
        c_clean = city_name.strip().lower()
        return [
            p for p in self.pois if p.city.lower() == c_clean and p.tier <= max_tier
        ]

    async def find_meal_spots(self, city_name: str, limit: int = 400) -> list[Poi]:
        c_clean = city_name.strip().lower()
        return [
            p
            for p in self.pois
            if p.city.lower() == c_clean
            and p.category.upper() in ("RESTAURANT", "CAFE", "BAKERY", "BAR")
        ][:limit]

    async def find_semantic_candidates(
        self, city_name: str, user_vector: list[float] | None = None, limit: int = 150
    ) -> list[tuple[Poi, float]]:
        matching = await self.find_by_city(city_name)
        return [(p, 0.85) for p in matching[:limit]]

    async def get_by_name(self, name: str, city: str | None = None) -> Poi | None:
        target = name.strip().lower()
        for p in self.pois:
            if p.name.strip().lower() == target:
                if city is None or p.city.lower() == city.strip().lower():
                    return p
        return None

    async def save_tiered_for_city(self, city_name: str, records: list[dict]) -> None:
        for r in records:
            poi = self._dict_to_poi(r, city_name)
            self.pois.append(poi)

    async def save_all_for_city(self, city_name: str, pois: list[Poi]) -> None:
        self.pois.extend(pois)

    async def update_poi_embeddings(
        self, updates: list[tuple[str, list[float]]]
    ) -> None:
        pass
