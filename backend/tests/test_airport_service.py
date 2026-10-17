import time
from zoneinfo import ZoneInfo

from app.services.airport_service import (
    get_airport_service,
    get_city_from_iata,
    get_iata_code,
)
from app.utils.mock_tickets import generate_mock_tickets


def test_get_iata_code_major_global_hubs():
    """Verifies primary world commercial hubs across continents."""
    hubs = {
        "Madrid": "MAD",
        "Tokyo": ["HND", "NRT"],
        "Paris": ["CDG", "ORY"],
        "London": ["LCY", "LHR", "LGW", "STN"],
        "New York": ["JFK", "LGA", "EWR"],
        "Sydney": "SYD",
        "Dubai": "DXB",
        "Singapore": "SIN",
        "Hong Kong": "HKG",
        "Bangkok": ["DMK", "BKK"],
        "Cairo": "CAI",
        "São Paulo": ["GRU", "CGH"],
        "Buenos Aires": ["AEP", "EZE"],
        "Toronto": ["YYZ", "YTZ"],
        "Los Angeles": "LAX",
        "Chicago": ["ORD", "MDW"],
        "Seoul": ["GMP", "ICN"],
    }
    for city, expected in hubs.items():
        code = get_iata_code(city)
        if isinstance(expected, list):
            assert (
                code in expected
            ), f"{city} resolved to {code}, expected one of {expected}"
        else:
            assert code == expected, f"{city} resolved to {code}, expected {expected}"


def test_get_iata_code_obscure_and_remote_cities():
    """Verifies remote, Arctic, desert, and island settlements worldwide."""
    obscure_cities = {
        "Longyearbyen": "LYR",  # Svalbard, Arctic Norway (northernmost commercial airport)
        "Tromsø": "TOS",  # Arctic Norway
        "Rovaniemi": "RVN",  # Lapland, Finland
        "Nuuk": "GOH",  # Greenland
        "Reykjavík": ["RKV", "KEF"],  # Iceland
        "Ushuaia": "USH",  # Tierra del Fuego, Argentina (southernmost city)
        "Punta Arenas": "PUQ",  # Southern Chile
        "San Pedro de Atacama": "CJC",  # Atacama Desert (Calama)
        "Antananarivo": "TNR",  # Madagascar
        "Windhoek": ["WDH", "ERS"],  # Namibia
        "Timbuktu": "TOM",  # Mali, Sahara
        "Ouarzazate": "OZZ",  # Morocco Atlas/Sahara gateway
        "Zanzibar": "ZNZ",  # Tanzania island
        "Ulaanbaatar": ["UBN", "ULN"],  # Mongolia
        "Samarkand": "SKD",  # Uzbekistan Silk Road
        "Luang Prabang": "LPQ",  # Laos
        "Suva": ["SUV", "NAN"],  # Fiji
        "Papeete": "PPT",  # Tahiti, French Polynesia
        "Hanga Roa": "IPC",  # Easter Island (Mataveri)
        "Koror": "ROR",  # Palau, Micronesia
        "Port Moresby": "POM",  # Papua New Guinea
    }
    for city, expected in obscure_cities.items():
        code = get_iata_code(city)
        if isinstance(expected, list):
            assert (
                code in expected
            ), f"Remote city '{city}' resolved to {code}, expected one of {expected}"
        else:
            assert (
                code == expected
            ), f"Remote city '{city}' resolved to {code}, expected {expected}"


def test_get_iata_code_cities_without_dedicated_airports():
    """Verifies that towns without commercial airports resolve to their real-world nearest commercial hubs."""
    non_airport_cities = {
        "Kyoto": ["ITM", "KIX"],  # Resolves Osaka Itami / Kansai
        "Sintra": ["CAT", "LIS"],  # Resolves Cascais / Lisbon
        "Positano": ["NAP", "QSR"],  # Resolves Naples / Salerno
        "Capri": ["NAP", "QSR"],  # Resolves Naples
        "Cambridge": ["CBG", "STN"],  # Resolves Cambridge or Stansted
        "Oxford": ["OXF", "LHR"],  # Resolves Oxford or Heathrow
        "Heidelberg": ["MHG", "FRA"],  # Resolves Mannheim or Frankfurt
        "Giza": ["SPX", "CAI"],  # Resolves Sphinx or Cairo
        "Banff": ["YBA", "YYC"],  # Resolves Banff or Calgary
        "Zermatt": ["SIR", "GVA"],  # Resolves Sion or Geneva
        "Versailles": ["TNF", "ORY", "CDG"],  # Resolves Toussus-le-Noble or Orly
    }
    for city, expected in non_airport_cities.items():
        code = get_iata_code(city)
        assert (
            code in expected
        ), f"Proximity city '{city}' resolved to {code}, expected one of {expected}"


def test_get_iata_code_multilingual_translations_and_accents():
    """Verifies accent stripping and GeoNames alternate names in foreign languages."""
    translations = {
        "Málaga": "AGP",
        "Córdoba": ["COR", "ODB"],
        "Seville": "SVQ",
        "Sevilla": "SVQ",
        "Milano": ["LIN", "MXP"],
        "Milan": ["LIN", "MXP"],
        "München": "MUC",
        "Munich": "MUC",
        "Wien": "VIE",
        "Vienna": "VIE",
        "Praha": "PRG",
        "Prague": "PRG",
        "Kraków": "KRK",
        "Krakow": "KRK",
        "Łódź": "LCJ",
        "Bogotá": "BOG",
        "Medellín": ["EOH", "MDE"],
        "Chișinău": "RMO",
        "Zürich": "ZRH",
    }
    for city, expected in translations.items():
        code = get_iata_code(city)
        if isinstance(expected, list):
            assert (
                code in expected
            ), f"Multilingual city '{city}' resolved to {code}, expected one of {expected}"
        else:
            assert (
                code == expected
            ), f"Multilingual city '{city}' resolved to {code}, expected {expected}"


def test_dynamic_country_hint_disambiguation():
    """Verifies that 'City, Country' hints dynamically disambiguate duplicate names without hardcoding."""
    # Amalfi in Italy vs Amalfi in Colombia
    assert get_iata_code("Amalfi, Italy") in ["QSR", "NAP"]
    assert get_iata_code("Amalfi, Colombia") == "AFI"

    # Cambridge in UK vs Cambridge in USA
    assert get_iata_code("Cambridge, UK") in ["CBG", "STN"]
    assert get_iata_code("Cambridge, USA") in ["BOS", "BED"]

    # Córdoba in Spain vs Córdoba in Argentina
    assert get_iata_code("Cordoba, Spain") == "ODB"
    assert get_iata_code("Cordoba, Argentina") == "COR"


def test_obscure_and_regional_airports_reverse_lookup():
    """Verifies get_city_from_iata and get_airport on obscure, remote, and regional airports."""
    test_airports = {
        "LYR": ("Longyearbyen", "NO", "Arctic/Longyear"),
        "USH": ("Ushuahia", "AR", "Tierra del Fuego"),
        "IPC": ("Isla De Pascua", "CL", "Easter Island"),
        "ROR": ("Babelthuap Island", "PW", "Palau"),
        "PPT": ("Papeete", "PF", "Tahiti"),
        "OZZ": ("Ouarzazate", "MA", "Morocco"),
        "CJC": ("Calama", "CL", "Atacama"),
        "PBH": ("Paro", "BT", "Bhutan"),
        "TNR": ("Antananarivo", "MG", "Madagascar"),
        "MAD": ("Madrid", "ES", "Spain"),
        "AGP": ("Malaga", "ES", "Costa del Sol"),
    }
    svc = get_airport_service()
    for iata, (expected_city, expected_country, _) in test_airports.items():
        assert svc.is_valid_iata(iata) is True
        ap = svc.get_airport(iata)
        assert ap is not None
        assert ap.iata == iata
        assert ap.country == expected_country
        assert ap.zoneinfo is not None
        assert ap.latitude != 0.0
        assert ap.longitude != 0.0

        city = get_city_from_iata(iata)
        assert (
            expected_city.lower() in city.lower()
            or city.lower() in expected_city.lower()
        )


def test_unknown_city_and_invalid_iata_fallbacks():
    """Verifies graceful fallback for fictitious inputs without raising exceptions."""
    assert get_iata_code("AtlantisNonExistentCity") == "XXX"
    assert get_iata_code("") == "XXX"
    assert get_iata_code(None) == "XXX"

    assert get_city_from_iata("NON_EXISTENT") == "Unknown"
    assert get_city_from_iata("") == "Unknown"
    assert get_city_from_iata(None) == "Unknown"

    svc = get_airport_service()
    assert svc.is_valid_iata("FOO") is False
    assert svc.is_valid_iata("") is False
    assert svc.is_valid_iata(None) is False
    assert svc.get_airport("FOO") is None
    assert svc.get_timezone_from_iata("FOO") == ZoneInfo("UTC")


def test_spatial_proximity_radius_search():
    """Verifies KDTree spatial radius and distance calculations."""
    svc = get_airport_service()

    # Central Paris (48.8566, 2.3522)
    paris_airports = svc.get_nearest_airport(48.8566, 2.3522, k=3, max_distance_km=50.0)
    assert len(paris_airports) >= 2
    paris_iatas = [a.iata for a in paris_airports]
    assert "ORY" in paris_iatas or "CDG" in paris_iatas or "LBG" in paris_iatas
    for ap in paris_airports:
        assert ap.distance_km is not None
        assert ap.distance_km < 50.0

    # Remote coordinate: Easter Island (-27.1536, -109.3497)
    remote = svc.get_nearest_airport(-27.1536, -109.3497, k=1)
    assert len(remote) == 1
    assert remote[0].iata == "IPC"
    assert remote[0].distance_km < 15.0


def test_performance_sub_millisecond_caching():
    """Verifies that repeat city and airport lookups complete in sub-millisecond time."""
    svc = get_airport_service()
    # Prime cache
    svc.get_iata_code("Tokyo")

    t0 = time.perf_counter()
    for _ in range(100):
        code = svc.get_iata_code("Tokyo")
        assert code in ["HND", "NRT"]
    elapsed_ms = (time.perf_counter() - t0) * 1000
    avg_per_query = elapsed_ms / 100.0
    # Average cached lookup must be well under 0.1ms
    assert (
        avg_per_query < 0.1
    ), f"Average lookup took {avg_per_query:.3f}ms, expected < 0.1ms"


def test_generate_mock_tickets_integration():
    """Verifies end-to-end integration with mock ticket generation."""
    res = generate_mock_tickets("Seville", "AtlantisNonExistentCity")
    assert res["origin_iata"] == "SVQ"
    assert res["destination_iata"] == "XXX"
    assert "booking_text" in res
