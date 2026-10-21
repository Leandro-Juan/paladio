"""
Lodging market data package.
Provides multi-provider aggregation, entity resolution, search sharding,
normalization, and coverage universe management.
"""

from app.engine.market.lodging.aggregator import LodgingAggregator
from app.engine.market.lodging.browser_pool import browser_pool
from app.engine.market.lodging.normalize import (
    convert_to_eur,
    normalize_property_name,
    parse_money,
)
from app.engine.market.lodging.resolver import (
    EntityResolver,
    encode_geohash,
    haversine_distance_meters,
)
from app.engine.market.lodging.sharding import SearchShard, ShardPlanner
from app.engine.market.lodging.universe import PropertyUniverseManager

__all__ = [
    "LodgingAggregator",
    "EntityResolver",
    "PropertyUniverseManager",
    "ShardPlanner",
    "SearchShard",
    "parse_money",
    "normalize_property_name",
    "convert_to_eur",
    "encode_geohash",
    "haversine_distance_meters",
    "browser_pool",
]
