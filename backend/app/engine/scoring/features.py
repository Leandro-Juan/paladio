import logging
from typing import Any

import jax.numpy as jnp

logger = logging.getLogger(__name__)


# UserStore was removed and replaced by SqlUserRepository in app.adapters.repositories.sql_user_repository


class PoiEncoder:
    """
    Encodes POI dictionaries into 128D deterministic feature vectors.
    """

    @staticmethod
    def encode(poi: dict[str, Any]) -> jnp.ndarray:
        # Create a 128D vector
        features = []

        # 1. Cost (normalized assuming max ~ 200)
        cost = float(poi.get("cost_eur", 0.0))
        features.append(min(cost / 200.0, 1.0))

        # 2. Duration (normalized assuming max ~ 240)
        dur = float(poi.get("duration_mins", 60.0))
        features.append(min(dur / 240.0, 1.0))

        # 3. Rating (normalized 0-5 -> 0-1)
        rating = float(poi.get("rating", 3.0))
        features.append(rating / 5.0)

        # 4. Category one-hot encoding (simplified)
        cat = poi.get("category", "").upper()
        cat_map = {
            "ATTRACTION": 0,
            "MUSEUM": 1,
            "LANDMARK": 2,
            "RESTAURANT": 3,
            "BAR": 4,
            "HOTEL": 5,
            "PARK": 6,
        }
        cat_idx = cat_map.get(cat, 7)
        for i in range(8):
            features.append(1.0 if i == cat_idx else 0.0)

        # Remove the md5 hash text embedding simulation
        # Pad remaining to 128
        while len(features) < 128:
            features.append(0.0)

        # Truncate if we went over
        features = features[:128]
        return jnp.array(features)
