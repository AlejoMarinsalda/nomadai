import httpx
from app.graph.state import ClimateInfo

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
CLIMATE_URL = "https://climate-api.open-meteo.com/v1/climate"

MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


def get_climate_summary(city: str, country: str) -> ClimateInfo:
    try:
        coords = _get_coordinates(city, country)
        if not coords:
            return ClimateInfo()

        lat, lon = coords
        monthly_temps = _get_monthly_temps(lat, lon)
        if not monthly_temps:
            return ClimateInfo()

        best_months = [MONTHS[i] for i, t in enumerate(monthly_temps) if 18 <= t <= 30]
        avoid_months = [MONTHS[i] for i, t in enumerate(monthly_temps) if t > 33 or t < 8]
        avg_temp = round(sum(monthly_temps) / len(monthly_temps), 1)

        return ClimateInfo(
            best_months=best_months,
            avoid_months=avoid_months,
            avg_temp_celsius=avg_temp,
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("climate API failed for %s, %s: %s", city, country, e)
        return ClimateInfo()


def _get_coordinates(city: str, country: str) -> tuple[float, float] | None:
    response = httpx.get(GEOCODING_URL, params={"name": city, "count": 1, "language": "es"})
    results = response.json().get("results", [])
    if not results:
        return None
    return results[0]["latitude"], results[0]["longitude"]


def _get_monthly_temps(lat: float, lon: float) -> list[float] | None:
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": "1991-01-01",
        "end_date": "2020-12-31",
        "monthly": "temperature_2m_mean",
        "models": "ERA5",
    }
    response = httpx.get(CLIMATE_URL, params=params)
    data = response.json()
    temps = data.get("monthly", {}).get("temperature_2m_mean", [])
    if not temps:
        return None
    monthly_avg = [round(sum(temps[i::12]) / len(temps[i::12]), 1) for i in range(12)]
    return monthly_avg
