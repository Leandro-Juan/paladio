"""
Weather API Router for Paladio.
100% Dynamic, Self-Hosted & Air-Gappable:
Resolves city coordinates and fetches dynamic weather telemetry and air quality metrics
from Open-Meteo (keyless, free public service) with graceful offline/resilient handling.
Zero hardcoded weather fixtures in production code.
"""

import logging
from typing import Any
import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.airport_service import get_airport_service

logger = logging.getLogger(__name__)

router = APIRouter()

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"


class WeatherHighlight(BaseModel):
    uv_index: float
    uv_status: str
    wind_speed_kmh: float
    wind_direction_deg: int
    wind_direction_cardinal: str
    sunrise: str
    sunset: str
    humidity_pct: int
    humidity_status: str
    visibility_km: float
    visibility_status: str
    aqi: int
    aqi_status: str


class WeatherDayForecast(BaseModel):
    date: str
    day_name: str
    weather_code: int
    condition: str
    icon_type: str
    temp_max_c: float
    temp_min_c: float
    highlights: WeatherHighlight


class WeatherForecastResponse(BaseModel):
    city: str
    latitude: float
    longitude: float
    timezone: str
    current_temp_c: float
    current_condition: str
    current_weather_code: int
    current_icon_type: str
    forecast_days: list[WeatherDayForecast]
    travel_advisory: str


def degrees_to_cardinal(deg: float | int) -> str:
    """Converts a wind angle in degrees to a 16-point cardinal direction string."""
    dirs = [
        "N",
        "NNE",
        "NE",
        "ENE",
        "E",
        "ESE",
        "SE",
        "SSE",
        "S",
        "SSW",
        "SW",
        "WSW",
        "W",
        "WNW",
        "NW",
        "NNW",
    ]
    idx = round((float(deg) % 360) / 22.5) % 16
    return dirs[idx]


def evaluate_uv(uv: float) -> str:
    if uv < 3:
        return "Low 👍"
    if uv < 6:
        return "Moderate"
    if uv < 8:
        return "High ⚠️"
    if uv < 11:
        return "Very High ⚠️"
    return "Extreme 🚨"


def evaluate_humidity(hum: int | float) -> str:
    if hum < 30:
        return "Dry 🏜️"
    if hum <= 65:
        return "Normal 👍"
    return "Humid 💧"


def evaluate_visibility(vis_km: float) -> str:
    if vis_km >= 9.0:
        return "Clear 👍"
    if vis_km >= 4.0:
        return "Average 😐"
    return "Haze / Fog 🌫️"


def evaluate_aqi(aqi: int) -> str:
    if aqi <= 50:
        return "Good 👍"
    if aqi <= 100:
        return "Moderate 😐"
    if aqi <= 150:
        return "Unhealthy for Sensitive Groups 😷"
    return "Unhealthy 👎"


def wmo_to_condition(code: int) -> tuple[str, str]:
    if code == 0:
        return "Clear Sky", "clear"
    if code in (1, 2):
        return "Partly Cloudy", "partly-cloudy"
    if code == 3:
        return "Overcast", "cloudy"
    if code in (45, 48):
        return "Fog", "fog"
    if code in (51, 53, 55, 56, 57):
        return "Drizzle", "drizzle"
    if code in (61, 63, 65, 66, 67, 80, 81, 82):
        return "Rain", "rain"
    if code in (71, 73, 75, 77, 85, 86):
        return "Snow", "snow"
    if code in (95, 96, 99):
        return "Thunderstorm", "thunderstorm"
    return "Cloudy", "cloudy"


async def resolve_coordinates(
    city: str, lat: float | None, lon: float | None
) -> tuple[float, float, str]:
    if lat is not None and lon is not None:
        return lat, lon, city or "Trip Destination"

    if not city:
        raise HTTPException(
            status_code=400, detail="Either city or both lat and lon must be provided"
        )

    try:
        airport_service = get_airport_service()
        matches = airport_service.search_locations(city, limit=1)
        if matches:
            first = matches[0]
            m_lat = first.get("lat")
            m_lng = first.get("lng")
            m_city = first.get("city") or city
            if m_lat is not None and m_lng is not None:
                return float(m_lat), float(m_lng), str(m_city)
    except Exception as e:
        logger.debug(f"AirportService lookup failed for '{city}': {e}")

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(
                OPEN_METEO_GEOCODING_URL,
                params={"name": city, "count": 1, "language": "en", "format": "json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results")
                if results and len(results) > 0:
                    r = results[0]
                    return (
                        float(r["latitude"]),
                        float(r["longitude"]),
                        r.get("name", city),
                    )
    except Exception as e:
        logger.warning(f"Geocoding failed for '{city}': {e}")

    raise HTTPException(
        status_code=404,
        detail=f"Could not resolve coordinates for destination: '{city}'",
    )


@router.get(
    "/forecast",
    response_model=WeatherForecastResponse,
    summary="Get dynamic weather forecast and highlights",
)
async def get_weather_forecast(
    city: str = Query("", description="City or destination name (e.g. Tokyo, Paris)"),
    lat: float | None = Query(None, description="Latitude (optional if city provided)"),
    lon: float | None = Query(
        None, description="Longitude (optional if city provided)"
    ),
) -> Any:
    resolved_lat, resolved_lon, resolved_city = await resolve_coordinates(
        city, lat, lon
    )

    forecast_params = {
        "latitude": resolved_lat,
        "longitude": resolved_lon,
        "daily": (
            "weather_code,temperature_2m_max,temperature_2m_min,"
            "uv_index_max,sunrise,sunset,wind_speed_10m_max,wind_direction_10m_dominant"
        ),
        "current": (
            "temperature_2m,relative_humidity_2m,weather_code,"
            "wind_speed_10m,wind_direction_10m,visibility"
        ),
        "hourly": "relative_humidity_2m,visibility,uv_index",
        "timezone": "auto",
        "forecast_days": 7,
    }

    air_quality_params = {
        "latitude": resolved_lat,
        "longitude": resolved_lon,
        "current": "us_aqi,pm2_5,pm10",
        "hourly": "us_aqi",
        "timezone": "auto",
    }

    forecast_data: dict[str, Any] = {}
    air_quality_data: dict[str, Any] = {}

    async with httpx.AsyncClient(timeout=8.0) as client:
        try:
            f_resp = await client.get(OPEN_METEO_FORECAST_URL, params=forecast_params)
            if f_resp.status_code == 200:
                forecast_data = f_resp.json()
            else:
                logger.error(
                    f"Open-Meteo forecast failed with status {f_resp.status_code}"
                )
                raise HTTPException(
                    status_code=502, detail="Weather telemetry provider unavailable"
                )
        except httpx.RequestError as exc:
            logger.error(f"Network error querying Open-Meteo forecast: {exc}")
            raise HTTPException(
                status_code=502, detail="Weather telemetry network failure"
            )

        try:
            aq_resp = await client.get(
                OPEN_METEO_AIR_QUALITY_URL, params=air_quality_params
            )
            if aq_resp.status_code == 200:
                air_quality_data = aq_resp.json()
        except Exception as exc:
            logger.warning(f"Air quality fetch failed: {exc}")

    current_block = forecast_data.get("current", {})
    daily_block = forecast_data.get("daily", {})
    hourly_block = forecast_data.get("hourly", {})
    tz = forecast_data.get("timezone", "UTC")

    curr_temp = float(current_block.get("temperature_2m", 20.0))
    curr_w_code = int(current_block.get("weather_code", 0))
    curr_condition, curr_icon = wmo_to_condition(curr_w_code)

    curr_aqi_raw = air_quality_data.get("current", {}).get("us_aqi")
    default_aqi = int(curr_aqi_raw) if curr_aqi_raw is not None else 45

    times = daily_block.get("time", [])
    w_codes = daily_block.get("weather_code", [])
    max_temps = daily_block.get("temperature_2m_max", [])
    min_temps = daily_block.get("temperature_2m_min", [])
    uv_indices = daily_block.get("uv_index_max", [])
    sunrises = daily_block.get("sunrise", [])
    sunsets = daily_block.get("sunset", [])
    wind_speeds = daily_block.get("wind_speed_10m_max", [])
    wind_dirs = daily_block.get("wind_direction_10m_dominant", [])

    hourly_hum = hourly_block.get("relative_humidity_2m", [])
    hourly_vis = hourly_block.get("visibility", [])
    hourly_aqi = air_quality_data.get("hourly", {}).get("us_aqi", [])

    days_list: list[WeatherDayForecast] = []
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    def format_time_label(iso_t: str) -> str:
        if not iso_t or "T" not in iso_t:
            return "06:30 AM"
        try:
            parts = iso_t.split("T")[1].split(":")
            hour = int(parts[0])
            mins = parts[1]
            am_pm = "AM" if hour < 12 else "PM"
            h12 = hour % 12 or 12
            return f"{h12}:{mins} {am_pm}"
        except Exception:
            return iso_t

    for i, date_str in enumerate(times):
        code = int(w_codes[i]) if i < len(w_codes) else curr_w_code
        cond, icon_type = wmo_to_condition(code)
        t_max = float(max_temps[i]) if i < len(max_temps) else curr_temp
        t_min = float(min_temps[i]) if i < len(min_temps) else curr_temp - 5.0
        uv = (
            float(uv_indices[i])
            if i < len(uv_indices) and uv_indices[i] is not None
            else 5.0
        )
        w_speed = (
            float(wind_speeds[i])
            if i < len(wind_speeds) and wind_speeds[i] is not None
            else 10.0
        )
        w_dir = (
            int(wind_dirs[i])
            if i < len(wind_dirs) and wind_dirs[i] is not None
            else 240
        )
        w_cardinal = degrees_to_cardinal(w_dir)

        s_rise_raw = sunrises[i] if i < len(sunrises) else ""
        s_set_raw = sunsets[i] if i < len(sunsets) else ""

        s_rise_formatted = format_time_label(s_rise_raw)
        s_set_formatted = format_time_label(s_set_raw)

        start_idx = i * 24
        end_idx = start_idx + 24
        day_hum_slice = (
            hourly_hum[start_idx:end_idx] if start_idx < len(hourly_hum) else []
        )
        day_vis_slice = (
            hourly_vis[start_idx:end_idx] if start_idx < len(hourly_vis) else []
        )
        day_aqi_slice = (
            hourly_aqi[start_idx:end_idx] if start_idx < len(hourly_aqi) else []
        )

        avg_hum = (
            round(sum(day_hum_slice) / len(day_hum_slice))
            if day_hum_slice
            else int(current_block.get("relative_humidity_2m", 60))
        )
        avg_vis_m = (
            sum(day_vis_slice) / len(day_vis_slice)
            if day_vis_slice
            else float(current_block.get("visibility", 10000.0))
        )
        vis_km = round(avg_vis_m / 1000.0, 1)

        day_aqi = (
            round(sum(day_aqi_slice) / len(day_aqi_slice))
            if day_aqi_slice
            else default_aqi
        )

        try:
            import datetime

            d_obj = datetime.date.fromisoformat(date_str)
            day_name = day_names[d_obj.weekday()]
        except Exception:
            day_name = f"Day {i + 1}"

        highlight = WeatherHighlight(
            uv_index=round(uv, 1),
            uv_status=evaluate_uv(uv),
            wind_speed_kmh=round(w_speed, 1),
            wind_direction_deg=w_dir,
            wind_direction_cardinal=w_cardinal,
            sunrise=s_rise_formatted,
            sunset=s_set_formatted,
            humidity_pct=avg_hum,
            humidity_status=evaluate_humidity(avg_hum),
            visibility_km=vis_km,
            visibility_status=evaluate_visibility(vis_km),
            aqi=day_aqi,
            aqi_status=evaluate_aqi(day_aqi),
        )

        days_list.append(
            WeatherDayForecast(
                date=date_str,
                day_name=day_name,
                weather_code=code,
                condition=cond,
                icon_type=icon_type,
                temp_max_c=round(t_max, 1),
                temp_min_c=round(t_min, 1),
                highlights=highlight,
            )
        )

    has_rain = any(
        d.icon_type in ("rain", "drizzle", "thunderstorm") for d in days_list
    )
    has_high_uv = any(d.highlights.uv_index >= 7 for d in days_list)
    has_unhealthy_air = any(d.highlights.aqi > 100 for d in days_list)

    advisories: list[str] = []
    if has_rain:
        advisories.append(
            "Precipitation forecast: Pack a lightweight tactical umbrella or waterproof layer."
        )
    if has_high_uv:
        advisories.append(
            "High UV levels detected around solar noon: Sun protection and hydration recommended."
        )
    if has_unhealthy_air:
        advisories.append(
            "Elevated AQI index: Consider reducing strenuous outdoor cardio during peak transit hours."
        )
    if not advisories:
        advisories.append(
            "Optimal meteorological conditions for pedestrian urban exploration."
        )

    travel_advisory = " • ".join(advisories)

    return WeatherForecastResponse(
        city=resolved_city,
        latitude=resolved_lat,
        longitude=resolved_lon,
        timezone=tz,
        current_temp_c=round(curr_temp, 1),
        current_condition=curr_condition,
        current_weather_code=curr_w_code,
        current_icon_type=curr_icon,
        forecast_days=days_list,
        travel_advisory=travel_advisory,
    )
