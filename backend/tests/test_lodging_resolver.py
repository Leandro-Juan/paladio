"""
Tests for lodging entity resolver and geohash utilities.
"""

from app.engine.market.lodging.resolver import encode_geohash, haversine_distance_meters


def test_encode_geohash():
    # Rome Colosseum: 41.8902, 12.4922
    gh = encode_geohash(41.8902, 12.4922, precision=7)
    assert len(gh) == 7
    assert gh.startswith("sr2y")


def test_haversine_distance():
    # Points 1km apart roughly
    d = haversine_distance_meters(41.8902, 12.4922, 41.8992, 12.4922)
    assert 900 < d < 1100
