import pytest
from unittest.mock import AsyncMock, patch
import httpx
from app.api.weather import (
    degrees_to_cardinal,
    evaluate_uv,
    evaluate_humidity,
    evaluate_visibility,
    evaluate_aqi,
    wmo_to_condition,
    get_weather_forecast,
    WeatherForecastResponse,
)


def test_weather_evaluations_and_cardinals():
    assert degrees_to_cardinal(0) == "N"
    assert degrees_to_cardinal(90) == "E"
    assert degrees_to_cardinal(180) == "S"
    assert degrees_to_cardinal(247.5) == "WSW"

    assert "Low" in evaluate_uv(2.0)
    assert "Moderate" in evaluate_uv(4.5)
    assert "High" in evaluate_uv(7.2)

    assert "Normal" in evaluate_humidity(50)
    assert "Dry" in evaluate_humidity(20)
    assert "Humid" in evaluate_humidity(85)

    assert "Clear" in evaluate_visibility(10.0)
    assert "Average" in evaluate_visibility(5.0)

    assert "Good" in evaluate_aqi(30)
    assert "Moderate" in evaluate_aqi(75)
    assert "Unhealthy" in evaluate_aqi(160)

    cond, icon = wmo_to_condition(0)
    assert cond == "Clear Sky"
    assert icon == "clear"

    cond_rain, icon_rain = wmo_to_condition(63)
    assert cond_rain == "Rain"
    assert icon_rain == "rain"


@pytest.mark.asyncio
async def test_get_weather_forecast_mocked():
    mock_forecast = {
        "current": {
            "temperature_2m": 15.5,
            "weather_code": 1,
            "relative_humidity_2m": 55,
            "wind_speed_10m": 8.5,
            "wind_direction_10m": 240,
            "visibility": 10000,
        },
        "daily": {
            "time": ["2026-11-04", "2026-11-05"],
            "weather_code": [1, 61],
            "temperature_2m_max": [16.0, 14.0],
            "temperature_2m_min": [8.0, 7.0],
            "uv_index_max": [4.5, 2.0],
            "sunrise": ["2026-11-04T06:30", "2026-11-05T06:31"],
            "sunset": ["2026-11-04T17:15", "2026-11-05T17:14"],
            "wind_speed_10m_max": [10.2, 18.5],
            "wind_direction_10m_dominant": [240, 180],
        },
        "hourly": {
            "relative_humidity_2m": [50] * 48,
            "visibility": [10000] * 48,
            "uv_index": [3] * 48,
        },
        "timezone": "Asia/Tokyo",
    }

    mock_air_quality = {
        "current": {"us_aqi": 35},
        "hourly": {"us_aqi": [35] * 48},
    }

    async def mock_get(url, params=None, **kwargs):
        resp = AsyncMock(spec=httpx.Response)
        resp.status_code = 200
        if "forecast" in url:
            resp.json.return_value = mock_forecast
        elif "air-quality" in url:
            resp.json.return_value = mock_air_quality
        return resp

    with patch("httpx.AsyncClient.get", side_effect=mock_get):
        result = await get_weather_forecast(
            city="Tokyo",
            lat=35.6895,
            lon=139.6917,
        )

        assert isinstance(result, WeatherForecastResponse)
        assert result.city == "Tokyo"
        assert len(result.forecast_days) == 2
        day1 = result.forecast_days[0]
        assert day1.highlights.uv_index == 4.5
        assert day1.highlights.wind_direction_cardinal == "WSW"
        assert day1.highlights.sunrise == "6:30 AM"
        assert day1.highlights.sunset == "5:15 PM"
        assert day1.highlights.humidity_pct == 50
        assert day1.highlights.aqi == 35


@pytest.mark.asyncio
async def test_get_weather_forecast_with_trip_dates():
    captured_forecast_params = {}
    captured_air_params = {}

    mock_forecast = {
        "current": {
            "temperature_2m": 18.0,
            "weather_code": 0,
            "relative_humidity_2m": 60,
            "wind_speed_10m": 12.0,
            "wind_direction_10m": 90,
            "visibility": 15000,
        },
        "daily": {
            "time": ["2026-11-10", "2026-11-11", "2026-11-12"],
            "weather_code": [0, 1, 2],
            "temperature_2m_max": [20.0, 19.0, 17.5],
            "temperature_2m_min": [11.0, 10.0, 9.0],
            "uv_index_max": [5.0, 4.0, 3.5],
            "sunrise": ["2026-11-10T06:40", "2026-11-11T06:41", "2026-11-12T06:42"],
            "sunset": ["2026-11-10T17:10", "2026-11-11T17:09", "2026-11-12T17:08"],
            "wind_speed_10m_max": [12.0, 10.0, 8.0],
            "wind_direction_10m_dominant": [90, 100, 110],
        },
        "hourly": {
            "relative_humidity_2m": [60] * 72,
            "visibility": [15000] * 72,
            "uv_index": [3] * 72,
        },
        "timezone": "Europe/Madrid",
    }

    mock_air_quality = {
        "current": {"us_aqi": 40},
        "hourly": {"us_aqi": [40] * 72},
    }

    async def mock_get(url, params=None, **kwargs):
        nonlocal captured_forecast_params, captured_air_params
        resp = AsyncMock(spec=httpx.Response)
        resp.status_code = 200
        if "forecast" in url:
            captured_forecast_params = dict(params or {})
            resp.json.return_value = mock_forecast
        elif "air-quality" in url:
            captured_air_params = dict(params or {})
            resp.json.return_value = mock_air_quality
        return resp

    with patch("httpx.AsyncClient.get", side_effect=mock_get):
        result = await get_weather_forecast(
            city="Madrid",
            lat=40.4168,
            lon=-3.7038,
            start_date="2026-11-10T09:00:00Z",
            end_date="2026-11-12",
        )

        assert isinstance(result, WeatherForecastResponse)
        assert result.city == "Madrid"
        assert len(result.forecast_days) == 3
        assert [d.date for d in result.forecast_days] == [
            "2026-11-10",
            "2026-11-11",
            "2026-11-12",
        ]

        # Verify that start_date and end_date were passed and forecast_days was NOT passed
        assert captured_forecast_params.get("start_date") == "2026-11-10"
        assert captured_forecast_params.get("end_date") == "2026-11-12"
        assert "forecast_days" not in captured_forecast_params

        # Verify air quality query received date range as well
        assert captured_air_params.get("start_date") == "2026-11-10"
        assert captured_air_params.get("end_date") == "2026-11-12"
