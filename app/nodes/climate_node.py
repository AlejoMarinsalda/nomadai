import logging
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from app.graph.state import NomadState, ClimateInfo
from app.tools.weather_tool import get_climate_summary
from app.config import settings
from app.utils import extract_json

logger = logging.getLogger(__name__)

_FALLBACK_PROMPT = """¿Cuáles son los mejores meses para visitar {city}, {country} como turista o nómada digital?
Respondé SOLO con JSON, sin texto adicional:
{{"best_months": ["Ene", "Feb"], "avoid_months": ["Jul", "Ago"], "rainy_season": "descripción breve o null"}}
Usá estas abreviaciones en español: Ene, Feb, Mar, Abr, May, Jun, Jul, Ago, Sep, Oct, Nov, Dic."""


def _llm_climate_fallback(city: str, country: str, base: ClimateInfo) -> ClimateInfo:
    try:
        llm = ChatGoogleGenerativeAI(
            model=settings.google_model_id,
            google_api_key=settings.google_api_key,
        )
        response = llm.invoke([HumanMessage(content=_FALLBACK_PROMPT.format(city=city, country=country))])
        data = extract_json(response.content)
        if not isinstance(data, dict):
            return base
        return ClimateInfo(
            best_months=data.get("best_months", []),
            avoid_months=data.get("avoid_months", []),
            avg_temp_celsius=base.avg_temp_celsius,
            rainy_season=data.get("rainy_season"),
        )
    except Exception as e:
        logger.warning("climate LLM fallback failed for %s, %s: %s", city, country, e)
        return base


def climate_node(state: NomadState) -> dict:
    updated_destinations = []

    for destination in state.destinations:
        climate_data = get_climate_summary(destination.city, destination.country)
        if not climate_data.best_months:
            climate_data = _llm_climate_fallback(destination.city, destination.country, climate_data)
        updated = destination.model_copy(update={"climate": climate_data})
        updated_destinations.append(updated)

    return {"destinations": updated_destinations}
