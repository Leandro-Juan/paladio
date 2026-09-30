from app.utils.iata_mapping import get_iata_code
from app.utils.mock_tickets import generate_mock_tickets


def test_get_iata_code_standard_cities():
    assert get_iata_code("Madrid") == "MAD"
    assert get_iata_code("Paris") in ["CDG", "ORY", "PRX"]


def test_get_iata_code_accented_cities():
    assert get_iata_code("Málaga") == "AGP"
    assert get_iata_code("Córdoba") in ["COR", "ODB"]


def test_get_iata_code_aliases():
    assert get_iata_code("Seville") == "SVQ"
    assert get_iata_code("Milano") in ["LIN", "MXP"]
    assert get_iata_code("Kyoto") in ["ITM", "KIX"]


def test_get_iata_code_unknown_city_does_not_raise_outside_runnable_context():
    # Must not raise RuntimeError: Called get_config outside of a runnable context
    result = get_iata_code("AtlantisNonExistentCity")
    assert result == "XXX"


def test_generate_mock_tickets_with_alias_and_unknown_city():
    res = generate_mock_tickets("Seville", "AtlantisNonExistentCity")
    assert res["origin_iata"] == "SVQ"
    assert res["destination_iata"] == "XXX"
    assert "booking_text" in res
