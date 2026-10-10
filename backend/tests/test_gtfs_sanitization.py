"""Unit tests for GTFS sanitization protecting Valhalla from segfaults."""

import csv
import os
import tempfile

from app.tasks import sanitize_gtfs_feed


def test_sanitize_gtfs_feed_renames_pathways_and_prunes_outliers():
    with tempfile.TemporaryDirectory() as tmpdir:
        # 1. Create a dummy pathways.txt
        pathways_path = os.path.join(tmpdir, "pathways.txt")
        with open(pathways_path, "w", encoding="utf-8") as f:
            f.write(
                "pathway_id,from_stop_id,to_stop_id,pathway_mode,is_bidirectional\n"
            )
            f.write("pw1,s1,s2,1,1\n")

        # 2. Create stops.txt:
        # - s_sevilla: inside Sevilla core (37.3891, -5.9845)
        # - s_utrera: within metropolitan radius (~30 km from Sevilla, 37.1850, -5.7800)
        # - s_entrance: location_type == 2 (should be pruned)
        # - s_almendricos: Murcia stop (~370 km away, 37.4748, -1.7796, should be pruned)
        # - s_orphan_child: inside radius, but parent_station was s_almendricos (parent should be cleared)
        stops_path = os.path.join(tmpdir, "stops.txt")
        with open(stops_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=[
                    "stop_id",
                    "stop_name",
                    "stop_lat",
                    "stop_lon",
                    "location_type",
                    "parent_station",
                ],
            )
            writer.writeheader()
            writer.writerow(
                {
                    "stop_id": "s_sevilla",
                    "stop_name": "Sevilla Santa Justa",
                    "stop_lat": "37.3891",
                    "stop_lon": "-5.9845",
                    "location_type": "0",
                    "parent_station": "",
                }
            )
            writer.writerow(
                {
                    "stop_id": "s_utrera",
                    "stop_name": "Utrera",
                    "stop_lat": "37.1850",
                    "stop_lon": "-5.7800",
                    "location_type": "0",
                    "parent_station": "",
                }
            )
            writer.writerow(
                {
                    "stop_id": "s_entrance",
                    "stop_name": "Metro Entrance",
                    "stop_lat": "37.3890",
                    "stop_lon": "-5.9840",
                    "location_type": "2",
                    "parent_station": "s_sevilla",
                }
            )
            writer.writerow(
                {
                    "stop_id": "s_almendricos",
                    "stop_name": "Almendricos Station",
                    "stop_lat": "37.4748",
                    "stop_lon": "-1.7796",
                    "location_type": "1",
                    "parent_station": "",
                }
            )
            writer.writerow(
                {
                    "stop_id": "s_orphan_child",
                    "stop_name": "Child Station",
                    "stop_lat": "37.3900",
                    "stop_lon": "-5.9850",
                    "location_type": "0",
                    "parent_station": "s_almendricos",
                }
            )

        # 3. Create stop_times.txt
        stop_times_path = os.path.join(tmpdir, "stop_times.txt")
        with open(stop_times_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=[
                    "trip_id",
                    "arrival_time",
                    "departure_time",
                    "stop_id",
                    "stop_sequence",
                ],
            )
            writer.writeheader()
            # Trip 1: valid local trip (s_sevilla -> s_utrera)
            writer.writerow(
                {
                    "trip_id": "t_local",
                    "arrival_time": "10:00:00",
                    "departure_time": "10:00:00",
                    "stop_id": "s_sevilla",
                    "stop_sequence": "1",
                }
            )
            writer.writerow(
                {
                    "trip_id": "t_local",
                    "arrival_time": "10:30:00",
                    "departure_time": "10:30:00",
                    "stop_id": "s_utrera",
                    "stop_sequence": "2",
                }
            )
            # Trip 2: outlier trip (s_almendricos only)
            writer.writerow(
                {
                    "trip_id": "t_outlier",
                    "arrival_time": "11:00:00",
                    "departure_time": "11:00:00",
                    "stop_id": "s_almendricos",
                    "stop_sequence": "1",
                }
            )

        # 4. Create trips.txt
        trips_path = os.path.join(tmpdir, "trips.txt")
        with open(trips_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["route_id", "service_id", "trip_id"])
            writer.writeheader()
            writer.writerow(
                {"route_id": "r1", "service_id": "srv1", "trip_id": "t_local"}
            )
            writer.writerow(
                {"route_id": "r2", "service_id": "srv2", "trip_id": "t_outlier"}
            )

        # Run sanitization with Sevilla coordinates and 70 km radius
        sanitize_gtfs_feed(
            gtfs_dir=tmpdir,
            center_lat=37.3891,
            center_lon=-5.9845,
            max_radius_km=70.0,
        )

        # Assert pathways renamed
        assert not os.path.exists(pathways_path)
        assert os.path.exists(pathways_path + ".disabled")

        # Read sanitized stops
        with open(stops_path, "r", encoding="utf-8") as f:
            reader = list(csv.DictReader(f))
            kept_ids = {r["stop_id"] for r in reader}
            stops_by_id = {r["stop_id"]: r for r in reader}

        # Check kept stops
        assert "s_sevilla" in kept_ids
        assert "s_utrera" in kept_ids
        assert "s_orphan_child" in kept_ids
        # Check pruned stops
        assert "s_entrance" not in kept_ids
        assert "s_almendricos" not in kept_ids

        # Orphan child had parent s_almendricos pruned, so parent_station must be cleared
        assert stops_by_id["s_orphan_child"]["parent_station"] == ""

        # Check sanitized trips
        with open(trips_path, "r", encoding="utf-8") as f:
            trips = list(csv.DictReader(f))
            kept_trips = {r["trip_id"] for r in trips}

        assert "t_local" in kept_trips
        assert "t_outlier" not in kept_trips
