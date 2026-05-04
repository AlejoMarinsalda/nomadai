import asyncio
import logging

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage

from app.graph.state import NomadState, Destination, DestinationMedia, ClimateInfo, VisaInfo
from app.tools.youtube_tool import search_youtube_reviews
from app.tools.search_tool import search_web
from app.tools.weather_tool import get_climate_summary
from app.tools.accommodation_tool import get_accommodation_links
from app.services.rag_store import search_rag
from app.config import settings
from app.utils import extract_json

logger = logging.getLogger(__name__)

_CLIMATE_PROMPT = """¿Cuáles son los mejores meses para visitar {city}, {country} como nómada digital?
{context}
Respondé SOLO con JSON:
{{"best_months": ["Ene", "Feb"], "avoid_months": ["Jul", "Ago"], "rainy_season": "descripción breve o null"}}
Usá abreviaciones en español: Ene, Feb, Mar, Abr, May, Jun, Jul, Ago, Sep, Oct, Nov, Dic."""

_VISA_SYSTEM = """Sos un experto en visas para nómadas digitales. Respondé ÚNICAMENTE con JSON:
{
  "visa_required": true,
  "visa_type": "nombre del tipo de visa",
  "max_stay_days": 90,
  "requirements": ["req 1", "req 2"],
  "source_url": "https://..."
}"""


def _enrich_media(dest: Destination) -> DestinationMedia:
    query = f"{dest.city} {dest.country} digital nomad review"
    youtube_links = search_youtube_reviews(query)
    results = search_web(f"digital nomad influencer living in {dest.city} {dest.country} YouTube channel")
    return DestinationMedia(youtube_links=youtube_links, influencers=results[:3] if results else [])


def _enrich_climate(dest: Destination) -> ClimateInfo:
    # RAG primero: si hay docs en la base de conocimiento, evita llamada a weather API
    rag_results = search_rag(f"clima mejores meses {dest.city} {dest.country} nómada digital", k=2)

    if not rag_results:
        # Sin RAG: intentar weather API directamente
        climate = get_climate_summary(dest.city, dest.country)
        if climate.best_months:
            return climate

    context_text = "\n\nContexto:\n" + "\n".join(rag_results) if rag_results else ""

    try:
        llm = ChatGoogleGenerativeAI(model=settings.google_model_id, google_api_key=settings.google_api_key)
        prompt = _CLIMATE_PROMPT.format(city=dest.city, country=dest.country, context=context_text)
        response = llm.invoke([HumanMessage(content=prompt)])
        data = extract_json(response.content)
        if isinstance(data, dict):
            return ClimateInfo(
                best_months=data.get("best_months", []),
                avoid_months=data.get("avoid_months", []),
                avg_temp_celsius=None,
                rainy_season=data.get("rainy_season"),
            )
    except Exception as e:
        logger.warning("climate LLM falló para %s: %s", dest.city, e)

    return get_climate_summary(dest.city, dest.country)


def _enrich_visa(dest: Destination, nationality: str) -> VisaInfo:
    # RAG primero: si hay docs de visa para esta nacionalidad/destino, evita llamada a Tavily
    rag_results = search_rag(f"visa {nationality} ciudadanos {dest.country} nómada digital", k=3)

    if rag_results:
        context = "\n".join(rag_results)
    else:
        results = search_web(f"visa requirements {nationality} citizens {dest.country} digital nomad 2024")
        context = "\n".join(results[:3]) if results else "Sin resultados."

    try:
        llm = ChatGoogleGenerativeAI(model=settings.google_model_id, google_api_key=settings.google_api_key)
        prompt = f"Nacionalidad: {nationality}\nDestino: {dest.city}, {dest.country}\n\n{context}\n\nRespondé el JSON."
        response = llm.invoke([SystemMessage(content=_VISA_SYSTEM), HumanMessage(content=prompt)])
        data = extract_json(response.content)
        if isinstance(data, dict):
            return VisaInfo(**data)
    except Exception as e:
        logger.warning("visa falló para %s: %s", dest.city, e)
    return VisaInfo()


def _enrich_local_info(dest: Destination, hobbies: list[str]) -> str:
    """Consulta el RAG para info de hobbies y networking específica del destino."""
    hobby_str = " ".join(hobbies) if hobbies else "nomada digital"
    hobbies_results = search_rag(f"{hobby_str} {dest.city} {dest.country} lugares actividades", k=2)
    networking_results = search_rag(f"networking coworking comunidad nómada digital {dest.city} {dest.country}", k=2)

    parts = []
    if hobbies_results:
        parts.append("HOBBIES Y ACTIVIDADES LOCALES:\n" + "\n".join(hobbies_results))
    if networking_results:
        parts.append("NETWORKING Y COMUNIDAD:\n" + "\n".join(networking_results))

    return "\n\n".join(parts)


async def _enrich_one(dest: Destination, nationality: str, hobbies: list[str]) -> Destination:
    media, climate, visa, local_info = await asyncio.gather(
        asyncio.to_thread(_enrich_media, dest),
        asyncio.to_thread(_enrich_climate, dest),
        asyncio.to_thread(_enrich_visa, dest, nationality),
        asyncio.to_thread(_enrich_local_info, dest, hobbies),
    )
    return dest.model_copy(update={
        "media": media,
        "climate": climate,
        "visa": visa,
        "local_info": local_info,
        "accommodation_links": get_accommodation_links(dest.city, dest.country),
    })


async def enrichment_node(state: NomadState) -> dict:
    nationality = state.user_profile.nationality or "argentina"
    hobbies = state.user_profile.hobbies or []

    enriched = await asyncio.gather(*[
        _enrich_one(dest, nationality, hobbies) for dest in state.destinations
    ])
    return {"destinations": list(enriched)}
