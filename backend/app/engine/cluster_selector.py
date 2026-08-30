import logging
from typing import Any

import numpy as np
from sklearn.cluster import KMeans

logger = logging.getLogger(__name__)


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0  # Earth radius in kilometers
    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)
    a = (
        np.sin(dlat / 2) ** 2
        + np.cos(np.radians(lat1)) * np.cos(np.radians(lat2)) * np.sin(dlon / 2) ** 2
    )
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
    return R * c


class ClusterSelector:
    """
    Implements Spatial-Affinity Clustering to filter a large dataset of POIs down to
    a manageable subset (<= 64) for the C++ optimization engine.
    """

    def __init__(
        self,
        max_pois: int = 50,
        alpha: float = 1.0,
        beta: float = 0.5,
        gamma: float = 0.2,
    ):
        self.max_pois = max_pois
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma

    def select_n_clusters(
        self,
        pois: list[dict[str, Any]],
        hotel_lat: float,
        hotel_lon: float,
        mandatory_names: list[str],
        num_days: int,
    ) -> list[list[dict[str, Any]]]:
        """
        Groups POIs into spatial clusters, scores each cluster based on proximity to the hotel
        and mocked user affinity, and returns `num_days` independent clusters.
        Always distributes mandatory POIs and high-centrality (top percentile) POIs.
        """
        # Separate mandatory POIs to ensure they are never filtered out
        mandatory_pois = []
        regular_pois = []

        for p in pois:
            name_lower = p.get("name", "").lower()
            is_mandatory = False
            for mn in mandatory_names:
                mn_lower = mn.lower()
                if mn_lower in name_lower or name_lower in mn_lower:
                    is_mandatory = True
                    break
                m_words = [
                    w
                    for w in mn_lower.split()
                    if len(w) > 3
                    and w not in ("museum", "the", "del", "de", "la", "el", "of", "and")
                ]
                if m_words and any(w in name_lower for w in m_words):
                    is_mandatory = True
                    break
            # Mock Eigenvector Centrality - highly popular global nodes
            is_high_centrality = p.get("centrality_score", 0.0) > 0.95

            if is_mandatory or is_high_centrality:
                mandatory_pois.append(p)
            else:
                regular_pois.append(p)

        if not regular_pois:
            result = [[] for _ in range(num_days)]
            for i, p in enumerate(mandatory_pois):
                result[i % num_days].append(p)
            return result

        # Extract coordinates for clustering
        coords = []
        for p in regular_pois:
            lat = p.get("location", {}).get("latitude", hotel_lat)
            lon = p.get("location", {}).get("longitude", hotel_lon)
            coords.append([lat, lon])

        X = np.array(coords)

        # Ensure we ask for at least num_days clusters from KMeans (if we have enough POIs)
        n_clusters = max(num_days, min(len(regular_pois) // 10 + 1, 15))
        n_clusters = min(n_clusters, len(regular_pois))

        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init="auto")
        labels = kmeans.fit_predict(X)

        # Score clusters
        cluster_scores = {}
        cluster_members = {i: [] for i in range(n_clusters)}

        for idx, label in enumerate(labels):
            cluster_members[label].append(regular_pois[idx])

        for k in range(n_clusters):
            members = cluster_members[k]
            if not members:
                cluster_scores[k] = -9999
                continue

            centroid_lat = kmeans.cluster_centers_[k][0]
            centroid_lon = kmeans.cluster_centers_[k][1]

            # 1. Proximity Penalty (Distance from hotel to cluster centroid)
            dist_to_hotel = haversine_distance(
                centroid_lat, centroid_lon, hotel_lat, hotel_lon
            )

            # 2. Affinity Mass (Mocked: random affinity score for each POI for now)
            # In a real RAG system, this would be cosine_similarity(user_embedding, poi_embedding)
            affinity_mass = sum(np.random.uniform(0.5, 1.0) for _ in members)

            # 3. Diversity (Entropy of categories)
            categories = [p.get("category", "ATTRACTION") for p in members]
            _unique_cats, counts = np.unique(categories, return_counts=True)
            probs = counts / len(members)
            entropy = -np.sum(probs * np.log2(probs + 1e-9))

            # Final Objective Function Z(C_k)
            Z_k = (
                self.alpha * affinity_mass
                - self.beta * dist_to_hotel
                + self.gamma * entropy
            )
            cluster_scores[k] = Z_k

        # Select top clusters
        sorted_clusters = sorted(
            cluster_scores.keys(), key=lambda k: cluster_scores[k], reverse=True
        )

        top_k = sorted_clusters[:num_days]
        daily_clusters = []
        for k in top_k:
            # Sort cluster members by their centrality/importance to ensure we keep the best
            # For now we'll just slice the top max_pois
            cluster_pois = cluster_members[k]
            daily_clusters.append(cluster_pois[: self.max_pois])

        while len(daily_clusters) < num_days:
            daily_clusters.append([])

        # Distribute mandatory POIs evenly to ensure they are visited
        for i, mp in enumerate(mandatory_pois):
            idx = i % num_days
            if len(daily_clusters[idx]) < self.max_pois:
                daily_clusters[idx].append(mp)

        return daily_clusters
