import pytest
from app.services.gtfs_route_service import (
    get_gtfs_route_finder,
    calculate_haversine_km,
)
from app.services.transit_service import synthesize_fallback_transit_leg

pytestmark = [pytest.mark.slow, pytest.mark.live_integration]


# 22 diverse, realistic POI pairs across Greater Tokyo
TOKYO_POI_PAIRS = [
    # 1. Airport to Major Hub
    {
        "name": "Haneda Airport to Shinjuku",
        "orig": {
            "name": "Haneda International Airport (HND)",
            "lat": 35.5457,
            "lon": 139.7761,
            "category": "AIRPORT",
        },
        "dest": {"name": "Hotel Gracery Shinjuku", "lat": 35.6952, "lon": 139.7024},
        "is_airport": True,
        "expected_lines": [
            "Haneda Airport Line",
            "Airport Line",
            "Oedo Line",
            "Yamanote Line",
            "Keikyu",
        ],
    },
    # 2. Major Terminal to Shibuya
    {
        "name": "Tokyo Station to Shibuya Station",
        "orig": {"name": "Tokyo Station", "lat": 35.6812, "lon": 139.7671},
        "dest": {"name": "Shibuya Station", "lat": 35.6580, "lon": 139.7016},
        "is_airport": False,
        "expected_lines": ["Yamanote Line", "Yamanote Freight Line", "Ginza Line"],
    },
    # 3. Shinjuku to Shibuya
    {
        "name": "Shinjuku Station to Shibuya Crossing",
        "orig": {"name": "Shinjuku Station", "lat": 35.6909, "lon": 139.7003},
        "dest": {"name": "Watch Shibuya Crossing", "lat": 35.6595, "lon": 139.7005},
        "is_airport": False,
        "expected_lines": [
            "Yamanote Line",
            "Fukutoshin Line",
            "Saikyo Line",
            "Shonan-Shinjuku Line",
            "Yamanote Freight Line",
        ],
    },
    # 4. Asakusa to Tokyo Skytree
    {
        "name": "Senso-ji to Tokyo Skytree",
        "orig": {"name": "Sensō-ji", "lat": 35.7148, "lon": 139.7967},
        "dest": {"name": "Tokyo Skytree", "lat": 35.7101, "lon": 139.8107},
        "is_airport": False,
        "expected_lines": ["TOBU SKYTREE Line", "Asakusa Line"],
    },
    # 5. Ueno Museum to Akihabara
    {
        "name": "Tokyo National Museum (Ueno) to Akihabara",
        "orig": {"name": "Tokyo National Museum", "lat": 35.7189, "lon": 139.7765},
        "dest": {"name": "Akihabara Electric Town", "lat": 35.6983, "lon": 139.7731},
        "is_airport": False,
        "expected_lines": [
            "Yamanote Line",
            "Keihin-Tohoku-Negishi Line",
            "Hibiya Line",
        ],
    },
    # 6. Ginza to Roppongi
    {
        "name": "Ginza to Roppongi Hills",
        "orig": {"name": "Ginza Six", "lat": 35.6696, "lon": 139.7640},
        "dest": {"name": "Roppongi Hills", "lat": 35.6605, "lon": 139.7292},
        "is_airport": False,
        "expected_lines": ["Hibiya Line", "Oedo Line"],
    },
    # 7. Shinjuku to Tokyo Station
    {
        "name": "Shinjuku to Tokyo Station",
        "orig": {"name": "Shinjuku Station", "lat": 35.6909, "lon": 139.7003},
        "dest": {"name": "Tokyo Station", "lat": 35.6812, "lon": 139.7671},
        "is_airport": False,
        "expected_lines": [
            "Marunouchi Line",
            "Chuo Rapid Line",
            "Chuo Line",
            "Yamanote Line",
        ],
    },
    # 8. Shibuya to Omotesando
    {
        "name": "Shibuya to Omotesando",
        "orig": {"name": "Shibuya Sky", "lat": 35.6585, "lon": 139.7022},
        "dest": {"name": "Omotesando Hills", "lat": 35.6672, "lon": 139.7099},
        "is_airport": False,
        "expected_lines": ["Ginza Line", "Hanzomon Line", "Chiyoda Line"],
    },
    # 9. Roppongi to Tsukiji Outer Market
    {
        "name": "Roppongi to Tsukiji Outer Market",
        "orig": {"name": "Mori Art Museum", "lat": 35.6605, "lon": 139.7292},
        "dest": {"name": "Tsukiji Outer Market", "lat": 35.6655, "lon": 139.7707},
        "is_airport": False,
        "expected_lines": ["Hibiya Line", "Oedo Line"],
    },
    # 10. Ikebukuro to Shinjuku
    {
        "name": "Ikebukuro to Shinjuku",
        "orig": {"name": "Sunshine 60", "lat": 35.7289, "lon": 139.7191},
        "dest": {"name": "Hotel Gracery Shinjuku", "lat": 35.6952, "lon": 139.7024},
        "is_airport": False,
        "expected_lines": [
            "Yamanote Line",
            "Fukutoshin Line",
            "Saikyo Line",
            "Marunouchi Line",
            "Shonan-Shinjuku Line",
        ],
    },
    # 11. Haneda Airport to Tokyo Station
    {
        "name": "Haneda Airport to Tokyo Station",
        "orig": {
            "name": "Haneda International Airport (HND)",
            "lat": 35.5457,
            "lon": 139.7761,
            "category": "AIRPORT",
        },
        "dest": {"name": "Tokyo Station", "lat": 35.6812, "lon": 139.7671},
        "is_airport": True,
        "expected_lines": [
            "Haneda Airport Line",
            "Airport Line",
            "Yamanote Line",
            "Keihin-Tohoku-Negishi Line",
            "Keikyu",
        ],
    },
    # 12. Odaiba to Shimbashi
    {
        "name": "Odaiba to Shimbashi",
        "orig": {"name": "Aqua City Odaiba", "lat": 35.6268, "lon": 139.7714},
        "dest": {"name": "Shimbashi Station", "lat": 35.6664, "lon": 139.7583},
        "is_airport": False,
        "expected_lines": ["Yurikamome Line", "Rinkai Line"],
    },
    # 13. Senso-ji to Ueno Park
    {
        "name": "Senso-ji to Ueno Park",
        "orig": {"name": "Sensō-ji", "lat": 35.7148, "lon": 139.7967},
        "dest": {"name": "Ueno Onshi Park", "lat": 35.7141, "lon": 139.7741},
        "is_airport": False,
        "expected_lines": ["Ginza Line", "Hibiya Line"],
    },
    # 14. Akihabara to Nakano
    {
        "name": "Akihabara to Nakano Broadway",
        "orig": {"name": "Akihabara Station", "lat": 35.6983, "lon": 139.7731},
        "dest": {"name": "Nakano Broadway", "lat": 35.7088, "lon": 139.6657},
        "is_airport": False,
        "expected_lines": [
            "Chuo-Sobu Line",
            "Chuo Sobu Local Line",
            "Chuo Rapid Line",
            "Tozai Line",
        ],
    },
    # 15. Shibuya to Kichijoji
    {
        "name": "Shibuya to Inokashira Park (Kichijoji)",
        "orig": {"name": "Shibuya Station", "lat": 35.6580, "lon": 139.7016},
        "dest": {"name": "Inokashira Park", "lat": 35.6997, "lon": 139.5786},
        "is_airport": False,
        "expected_lines": ["Inokashira Line", "Chuo Rapid Line"],
    },
    # 16. Shinjuku to Shimokitazawa
    {
        "name": "Shinjuku to Shimokitazawa",
        "orig": {"name": "Shinjuku Station", "lat": 35.6909, "lon": 139.7003},
        "dest": {
            "name": "Shimokitazawa Vintage District",
            "lat": 35.6616,
            "lon": 139.6667,
        },
        "is_airport": False,
        "expected_lines": ["Odawara Line", "Inokashira Line"],
    },
    # 17. Roppongi to Shinjuku
    {
        "name": "Roppongi to Shinjuku",
        "orig": {"name": "Roppongi Station", "lat": 35.6628, "lon": 139.7314},
        "dest": {"name": "Shinjuku Station", "lat": 35.6909, "lon": 139.7003},
        "is_airport": False,
        "expected_lines": ["Oedo Line", "Marunouchi Line"],
    },
    # 18. Meiji Jingu (Harajuku) to Shibuya
    {
        "name": "Meiji Jingu to Shibuya",
        "orig": {"name": "Meiji Jingū Shrine", "lat": 35.6764, "lon": 139.6993},
        "dest": {"name": "Shibuya Crossing", "lat": 35.6595, "lon": 139.7005},
        "is_airport": False,
        "expected_lines": ["Yamanote Line", "Fukutoshin Line"],
    },
    # 19. Tsukiji to Asakusa
    {
        "name": "Tsukiji to Asakusa",
        "orig": {"name": "Tsukiji Outer Market", "lat": 35.6655, "lon": 139.7707},
        "dest": {"name": "Sensō-ji Asakusa", "lat": 35.7148, "lon": 139.7967},
        "is_airport": False,
        "expected_lines": ["Asakusa Line", "Hibiya Line", "Ginza Line"],
    },
    # 20. Tokyo Tower to Roppongi
    {
        "name": "Tokyo Tower to Roppongi Hills",
        "orig": {"name": "Tokyo Tower", "lat": 35.6586, "lon": 139.7454},
        "dest": {"name": "Roppongi Hills", "lat": 35.6605, "lon": 139.7292},
        "is_airport": False,
        "expected_lines": ["Oedo Line", "Hibiya Line"],
    },
    # 21. Mitaka (Ghibli Museum) to Shinjuku
    {
        "name": "Ghibli Museum to Shinjuku",
        "orig": {"name": "Ghibli Museum Mitaka", "lat": 35.6962, "lon": 139.5704},
        "dest": {"name": "Shinjuku Station", "lat": 35.6909, "lon": 139.7003},
        "is_airport": False,
        "expected_lines": ["Chuo Rapid Line", "Chuo-Sobu Line"],
    },
    # 22. Tsukiji Outer Market to Haneda Airport
    {
        "name": "Tsukiji Outer Market to Haneda Airport",
        "orig": {"name": "Tsukiji Outer Market", "lat": 35.6655, "lon": 139.7707},
        "dest": {
            "name": "Haneda International Airport (HND)",
            "lat": 35.5457,
            "lon": 139.7761,
            "category": "AIRPORT",
        },
        "is_airport": True,
        "expected_lines": [
            "Oedo Line",
            "Haneda Airport Line",
            "Asakusa Line",
            "Airport Line",
        ],
    },
]


tokyo_gtfs_required = pytest.mark.skipif(
    get_gtfs_route_finder("tokyo") is None,
    reason="Requires compiled Tokyo GTFS feed on disk at $GTFS_BASE_DIR/tokyo",
)


@tokyo_gtfs_required
@pytest.mark.parametrize(
    "pair", TOKYO_POI_PAIRS, ids=[p["name"] for p in TOKYO_POI_PAIRS]
)
def test_tokyo_poi_pair_gtfs_routing(pair):
    finder = get_gtfs_route_finder("tokyo")
    assert finder is not None, "Tokyo GTFS feed must be available"
    assert len(finder.stops) > 2000, f"Expected >2000 stops, got {len(finder.stops)}"
    assert len(finder.routes) > 100, f"Expected >100 routes, got {len(finder.routes)}"

    orig = pair["orig"]
    dest = pair["dest"]
    route = finder.find_route(orig["lat"], orig["lon"], dest["lat"], dest["lon"])

    assert route is not None, f"Could not find transit route for {pair['name']}"
    assert (
        route["mode"] in ("direct", "transfer")
    ), f"Route for {pair['name']} fell back to {route['mode']}, expected direct or transfer"

    # 1. Verify clean station naming without redundant double wrapping like 'Tokyo (Tokyo (東京))'
    b_stop_name = route["board_stop"]["display_name"]
    a_stop_name = route["alight_stop"]["display_name"]
    assert (
        "((" not in b_stop_name
    ), f"Double-wrapping bug in board station name: {b_stop_name}"
    assert (
        "((" not in a_stop_name
    ), f"Double-wrapping bug in alight station name: {a_stop_name}"

    # 2. Verify lines used are authentic Tokyo transit lines
    lines_used = [route["route_1"]["name"]]
    if route["mode"] == "transfer":
        lines_used.append(route["route_2"]["name"])

    for l_name in lines_used:
        assert (
            l_name != "Airport Express"
        ), f"Synthetic 'Airport Express' line leaked in {pair['name']}"
        assert l_name != "Transit", f"Generic 'Transit' line returned in {pair['name']}"
        assert "((" not in l_name, f"Double-wrapping bug in route name: {l_name}"

    # Check that at least one of the expected real Tokyo lines is utilized
    matched_expected = any(
        any(exp.lower() in line_name.lower() for exp in pair["expected_lines"])
        for line_name in lines_used
    )
    assert matched_expected, f"Route for {pair['name']} used {lines_used}, expected one of {pair['expected_lines']}"

    # 3. Verify real physical walking distance from station to station during transfers
    if route["mode"] == "transfer":
        t1 = route.get("transfer_stop_1") or route["transfer_stop"]
        t2 = route.get("transfer_stop_2") or route["transfer_stop"]
        assert "((" not in t1["display_name"]
        assert "((" not in t2["display_name"]

        # Calculate exact GPS haversine distance between transfer stations
        real_walk_km = calculate_haversine_km(
            t1["lat"], t1["lon"], t2["lat"], t2["lon"]
        )
        recorded_walk_km = route.get("walk_transfer_km", 0.0)

        # Walking distance must match real coordinates within 20 meters
        assert abs(recorded_walk_km - real_walk_km) < 0.02, (
            f"Transfer walk distance mismatch between {t1['display_name']} and {t2['display_name']}: "
            f"recorded {recorded_walk_km}km vs real {real_walk_km}km"
        )
        assert (
            recorded_walk_km <= 0.35
        ), f"Transfer walking distance too large ({recorded_walk_km}km) in {pair['name']}"


@tokyo_gtfs_required
@pytest.mark.parametrize(
    "pair", TOKYO_POI_PAIRS[:5], ids=[p["name"] for p in TOKYO_POI_PAIRS[:5]]
)
def test_tokyo_poi_pair_synthesize_leg(pair):
    """
    Verifies that synthesize_fallback_transit_leg integrates cleanly with GTFSRouteFinder,
    producing authentic TransitSteps with real station-to-station walk distances and realistic EUR costs.
    """
    orig = pair["orig"]
    dest = pair["dest"]
    is_airport = pair.get("is_airport", False)

    leg = synthesize_fallback_transit_leg(
        origin={
            "name": orig["name"],
            "location": {"latitude": orig["lat"], "longitude": orig["lon"]},
            "category": orig.get("category", "POI"),
        },
        destination={
            "name": dest["name"],
            "location": {"latitude": dest["lat"], "longitude": dest["lon"]},
        },
        city="tokyo",
        is_airport_leg=is_airport,
    )

    assert leg.mode == "transit"
    assert len(leg.steps) >= 3

    # Check that real lines are present in steps
    transit_steps = [
        s for s in leg.steps if s.type in ("transit_board", "transit_transfer")
    ]
    assert len(transit_steps) >= 1

    for ts in transit_steps:
        assert (
            ts.transit_line != "Airport Express"
        ), f"Synthetic line leaked in {pair['name']}"
        assert ts.transit_line != "Transit"
        assert "((" not in (ts.transit_line or "")
        assert "((" not in (ts.station_name or "")

    # If there is a walking transfer between two distinct stations, verify its distance is real
    walk_transfer_step = next(
        (
            s
            for s in leg.steps
            if s.type == "walk" and "to transfer lines" in s.instruction
        ),
        None,
    )
    if walk_transfer_step:
        assert walk_transfer_step.distance_km > 0.03
        assert walk_transfer_step.distance_km <= 0.35
        expected_m = int(walk_transfer_step.distance_km * 1000)
        assert f"{expected_m}m" in walk_transfer_step.instruction

    # Verify cost in EUR is realistic (converted from JPY, ~0.40€ to 10.00€)
    assert (
        0.40 <= leg.cost_eur <= 10.0
    ), f"Unrealistic cost {leg.cost_eur} EUR for {pair['name']}"
