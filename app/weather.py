"""Today's weather for her city from Open-Meteo (free, no key), so Llama's long-wear tips match the real conditions."""
import logging

import httpx

from .schemas import Weather

log = logging.getLogger("by-hana.weather")

COORDS = {
    "riyadh": (24.71, 46.68), "jeddah": (21.49, 39.19), "dammam": (26.43, 50.10), "makkah": (21.39, 39.86),
    "madinah": (24.47, 39.61), "abha": (18.22, 42.51), "taif": (21.27, 40.42),
}


def current_weather(city: str) -> Weather | None:
    """Temperature, humidity and UV right now, or None if the city is unknown or Open-Meteo doesn't answer."""
    if city not in COORDS:
        return None
    lat, lon = COORDS[city]
    try:
        r = httpx.get("https://api.open-meteo.com/v1/forecast", timeout=5, params={
            "latitude": lat, "longitude": lon, "timezone": "Asia/Riyadh",
            "current": "temperature_2m,relative_humidity_2m,uv_index"})
        r.raise_for_status()
        now = r.json()["current"]
        return Weather(temp_c=round(now["temperature_2m"]), humidity=round(now["relative_humidity_2m"]),
                       uv=round(now.get("uv_index") or 0, 1))
    except Exception as exc:  # weather is a bonus: the look still works without it
        log.warning("Open-Meteo failed for %s: %s", city, exc)
        return None
