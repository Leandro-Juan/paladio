"""
Paladio Deal Engine Flights Infrastructure.
Resilient browser pools, regional corridor classifiers, and entity normalization.
Zero hardcoded data: all resolutions are computed dynamically via airportsdata and geonamescache.
"""

from app.engine.market.flights.browser_pool import flight_browser_pool
from app.engine.market.flights.classifier import FlightRouteClassifier

__all__ = [
    "flight_browser_pool",
    "FlightRouteClassifier",
]
