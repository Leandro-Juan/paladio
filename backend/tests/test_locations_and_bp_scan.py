import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_locations_search_dynamic(async_client: AsyncClient):
    # Test query for Madrid
    res = await async_client.get("/api/locations/search?q=Madrid")
    assert res.status_code == 200
    data = res.json()
    assert len(data) > 0
    assert any(
        item["city"] == "Madrid" and item["airport_iata"] == "MAD" for item in data
    )

    # Test query for Paris (multi-airport: both CDG and ORY must be present and distinct)
    res_paris = await async_client.get("/api/locations/search?q=Paris")
    assert res_paris.status_code == 200
    data_paris = res_paris.json()
    assert len(data_paris) > 0
    paris_iatas = [item["airport_iata"] for item in data_paris]
    assert "CDG" in paris_iatas
    assert "ORY" in paris_iatas
    # Ensure no duplicates in returned results
    assert len(paris_iatas) == len(set(paris_iatas))

    # Test IATA direct search
    res_iata = await async_client.get("/api/locations/search?q=JFK")
    assert res_iata.status_code == 200
    data_iata = res_iata.json()
    assert len(data_iata) > 0
    assert data_iata[0]["airport_iata"] == "JFK"


@pytest.mark.asyncio
async def test_scan_boarding_pass_for_new_trip(async_client: AsyncClient):
    # Standard IATA BCBP string
    sample_bcbp = "M1GARCIA/CARLOS       EIB1234 MADSVQIB 3166 291Y012A0001 100"
    res = await async_client.post(
        "/api/trips/scan-boarding-pass",
        data={"raw_text": sample_bcbp},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["origin_iata"] == "MAD"
    assert data["destination_iata"] == "SVQ"
    assert data["origin_city"] == "Madrid"
    assert data["destination_city"] in ["Sevilla", "Seville"]
    assert "3166" in data["flight_number"]
    assert data["departure_date"] is not None
