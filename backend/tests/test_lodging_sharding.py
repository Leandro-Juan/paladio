"""
Tests for lodging search shard planner.
Verifies spatial decomposition and star filtering shards.
"""

from app.engine.market.lodging.sharding import ShardPlanner


def test_shard_planner_base():
    shards = ShardPlanner.plan_shards(
        bbox=None, enable_spatial_split=False, enable_star_split=False
    )
    assert len(shards) == 1
    assert shards[0].shard_id == "base"


def test_shard_planner_star_split():
    shards = ShardPlanner.plan_shards(
        bbox=None, enable_spatial_split=False, enable_star_split=True
    )
    shard_ids = [s.shard_id for s in shards]
    assert "base" in shard_ids
    assert "stars_3" in shard_ids
    assert "stars_4" in shard_ids
    assert "stars_5" in shard_ids


def test_shard_planner_spatial_quadrants():
    # Rome bounding box approx: south=41.8, west=12.4, north=42.0, east=12.6 (span = 0.2 deg > 0.08)
    rome_bbox = [41.8, 12.4, 42.0, 12.6]
    shards = ShardPlanner.plan_shards(
        bbox=rome_bbox, enable_spatial_split=True, enable_star_split=True
    )
    shard_ids = [s.shard_id for s in shards]
    assert "quad_sw" in shard_ids
    assert "quad_se" in shard_ids
    assert "quad_nw" in shard_ids
    assert "quad_ne" in shard_ids
    assert len(shards) == 8  # 1 base + 3 stars + 4 quadrants
