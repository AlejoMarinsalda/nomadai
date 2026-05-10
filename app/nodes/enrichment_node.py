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


def _climate_prompt(city: str, country: str, context: str, language: str) -> str:
    if language.startswith("en"):
        return (
            f"What are the best months to visit {city}, {country} as a digital nomad?\n"
            f"{context}\n"
            'Reply ONLY with JSON:\n'
            '{"best_months": ["Jan", "Feb"], "avoid_months": ["Jul", "Aug"], "rainy_season": "brief description or null"}\n'
            "Use English month abbreviations: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec."
        )
    return (
        f"¿Cuáles son los mejores meses para visitar {city}, {country} como nómada digital?\n"
        f"{context}\n"
        'Respondé SOLO con JSON:\n'
        '{{"best_months": ["Ene", "Feb"], "avoid_months": ["Jul", "Ago"], "rainy_season": "descripción breve o null"}}\n'
        "Usá abreviaciones en español: Ene, Feb, Mar, Abr, May, Jun, Jul, Ago, Sep, Oct, Nov, Dic."
    )


def _visa_system(language: str) -> str:
    lang_note = (
        "Write ALL requirements in ENGLISH."
        if language.startswith("en")
        else "Escribí todos los requisitos en ESPAÑOL."
    )
    return (
        "You are a visa expert for digital nomads. Reply ONLY with JSON:\n"
        "{\n"
        '  "visa_required": true,\n'
        '  "visa_type": "visa type name",\n'
        '  "max_stay_days": 90,\n'
        '  "requirements": ["req 1", "req 2"],\n'
        '  "source_url": "https://..."\n'
        "}\n"
        + lang_note
    )


def _enrich_media(dest: Destination) -> DestinationMedia:
    query = f"{dest.city} {dest.country} digital nomad review"
    youtube_links = search_youtube_reviews(query)
    results = search_web(f"digital nomad influencer living in {dest.city} {dest.country} YouTube channel")
    return DestinationMedia(youtube_links=youtube_links, influencers=results[:3] if results else [])


def _enrich_climate(dest: Destination, language: str) -> ClimateInfo:
    rag_results = search_rag(f"clima mejores meses {dest.city} {dest.country} nómada digital", k=2)

    if not rag_results:
        climate = get_climate_summary(dest.city, dest.country)
        if climate.best_months:
            return climate

    context_text = "\n\nContexto:\n" + "\n".join(rag_results) if rag_results else ""

    try:
        llm = ChatGoogleGenerativeAI(model=settings.google_model_id, google_api_key=settings.google_api_key)
        prompt = _climate_prompt(dest.city, dest.country, context_text, language)
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


def _enrich_visa(dest: Destination, nationality: str, language: str) -> VisaInfo:
    rag_results = search_rag(f"visa {nationality} ciudadanos {dest.country} nómada digital", k=3)

    if rag_results:
        context = "\n".join(rag_results)
    else:
        results = search_web(f"visa requirements {nationality} citizens {dest.country} digital nomad 2024")
        context = "\n".join(results[:3]) if results else "No results."

    try:
        llm = ChatGoogleGenerativeAI(model=settings.google_model_id, google_api_key=settings.google_api_key)
        prompt = f"Nationality: {nationality}\nDestination: {dest.city}, {dest.country}\n\n{context}\n\nReturn the JSON."
        response = llm.invoke([SystemMessage(content=_visa_system(language)), HumanMessage(content=prompt)])
        data = extract_json(response.content)
        if isinstance(data, dict):
            return VisaInfo(**data)
    except Exception as e:
        logger.warning("visa falló para %s: %s", dest.city, e)
    return VisaInfo()


def _enrich_local_info(dest: Destination, hobbies: list[str]) -> str:
    hobby_str = " ".join(hobbies) if hobbies else "nomada digital"
    hobbies_results = search_rag(f"{hobby_str} {dest.city} {dest.country} lugares actividades", k=2)
    networking_results = search_rag(f"networking coworking comunidad nómada digital {dest.city} {dest.country}", k=2)

    parts = []
    if hobbies_results:
        parts.append("HOBBIES Y ACTIVIDADES LOCALES:\n" + "\n".join(hobbies_results))
    if networking_results:
        parts.append("NETWORKING Y COMUNIDAD:\n" + "\n".join(networking_results))

    return "\n\n".join(parts)


async def _enrich_one(dest: Destination, nationality: str, hobbies: list[str], language: str, budget: int | None = None) -> Destination:
    # LangGraph checkpoint deserialization may return dicts instead of Pydantic objects
    if isinstance(dest, dict):
        dest = Destination(**dest)

    results = await asyncio.gather(
        asyncio.to_thread(_enrich_media, dest),
        asyncio.to_thread(_enrich_climate, dest, language),
        asyncio.to_thread(_enrich_visa, dest, nationality, language),
        asyncio.to_thread(_enrich_local_info, dest, hobbies),
        return_exceptions=True,
    )

    media      = results[0] if isinstance(results[0], DestinationMedia) else DestinationMedia()
    climate    = results[1] if isinstance(results[1], ClimateInfo)      else ClimateInfo()
    visa       = results[2] if isinstance(results[2], VisaInfo)         else VisaInfo()
    local_info = results[3] if isinstance(results[3], str)              else ""

    if isinstance(results[0], Exception):
        logger.warning("_enrich_media falló para %s: %s", dest.city, results[0])
    if isinstance(results[1], Exception):
        logger.warning("_enrich_climate falló para %s: %s", dest.city, results[1])
    if isinstance(results[2], Exception):
        logger.warning("_enrich_visa falló para %s: %s", dest.city, results[2])
    if isinstance(results[3], Exception):
        logger.warning("_enrich_local_info falló para %s: %s", dest.city, results[3])

    return dest.model_copy(update={
        "media": media,
        "climate": climate,
        "visa": visa,
        "local_info": local_info,
        "accommodation_links": get_accommodation_links(dest.city, dest.country, budget, language),
    })


async def enrichment_node(state: NomadState) -> dict:
    nationality = state.user_profile.nationality or "argentina"
    hobbies     = state.user_profile.hobbies or []
    language    = state.language
    budget      = state.user_profile.budget_usd_monthly

    results = await asyncio.gather(*[
        _enrich_one(dest, nationality, hobbies, language, budget) for dest in state.destinations
    ], return_exceptions=True)

    enriched = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            logger.warning("_enrich_one falló para destino %d: %s", i, r)
            raw = state.destinations[i]
            enriched.append(raw if isinstance(raw, Destination) else Destination(**raw))
        else:
            enriched.append(r)

    return {"destinations": enriched}
