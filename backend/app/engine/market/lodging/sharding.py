"""
Search shard generator for deep hotel inventory extraction.
Splits geographic bounding boxes and filter spaces into discrete queries
to break through single-page pagination caps.
"""

from dataclasses import dataclass


@dataclass
class SearchShard:
    shard_id: str
    sub_bbox: list[float] | None  # [south, west, north, east]
    star_filter: int | None
    price_band: tuple[int, int] | None  # (min_cents, max_cents)


class ShardPlanner:
    """
    Decomposes a single destination search into multiple systematic shards.
    """

    @staticmethod
    def plan_shards(
        bbox: list[float] | None = None,
        enable_spatial_split: bool = True,
        enable_star_split: bool = True,
    ) -> list[SearchShard]:
        """
        Generates deterministic shards based on available bounding box and filtering dimensions.
        """
        shards: list[SearchShard] = []

        # Base shard: full destination, all stars
        shards.append(
            SearchShard(
                shard_id="base",
                sub_bbox=bbox,
                star_filter=None,
                price_band=None,
            )
        )

        # Star shards (3-star, 4-star, 5-star) to capture distinct quality brackets
        if enable_star_split:
            for s in (3, 4, 5):
                shards.append(
                    SearchShard(
                        shard_id=f"stars_{s}",
                        sub_bbox=bbox,
                        star_filter=s,
                        price_band=None,
                    )
                )

        # Spatial subdivision if bbox is available and wide (> 0.08 deg span ~8km)
        if enable_spatial_split and bbox and len(bbox) == 4:
            south, west, north, east = bbox[0], bbox[1], bbox[2], bbox[3]
            lat_span = north - south
            lon_span = east - west

            if lat_span > 0.08 or lon_span > 0.08:
                mid_lat = (south + north) / 2.0
                mid_lon = (west + east) / 2.0

                # 4 spatial quadrants: SW, SE, NW, NE
                quads = [
                    ("sw", [south, west, mid_lat, mid_lon]),
                    ("se", [south, mid_lon, mid_lat, east]),
                    ("nw", [mid_lat, west, north, mid_lon]),
                    ("ne", [mid_lat, mid_lon, north, east]),
                ]
                for q_name, q_bbox in quads:
                    shards.append(
                        SearchShard(
                            shard_id=f"quad_{q_name}",
                            sub_bbox=q_bbox,
                            star_filter=None,
                            price_band=None,
                        )
                    )

        return shards
