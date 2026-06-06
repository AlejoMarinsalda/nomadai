import json
import re
import logging
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from app.graph.state import NomadState, Destination
from app.config import settings

logger = logging.getLogger(__name__)

# ── LLM prompt ────────────────────────────────────────────────────────────────

_SCHEMA = (
    'For each destination produce an object with these exact keys:\n'
    '  "city"             : exact city name as given in the input\n'
    '  "tagline"          : 3-5 words describing THIS city (geographically accurate)\n'
    '  "ai_summary"       : 1-2 sentences about THIS city tailored to the user profile\n'
    '  "why_you_why_now"  : array of exactly 4 bullets specific to THIS city and user (max 10 words each)\n'
    '  "internet_mbps"    : realistic integer estimate for this city\n'
    '  "avg_temp_celsius" : realistic integer average temperature for this city\n'
    '  "security"         : one of: Excelente, Buena, Moderada\n'
    '  "community"        : one of: Muy alta, Alta, Media\n\n'
    'Return format: {"destinations": [item1, item2, ...]}\n'
)


def _system_prompt(language: str) -> str:
    lang_note = (
        "Generate ALL text fields in ENGLISH."
        if language.startswith("en")
        else "Generá TODOS los campos de texto en ESPAÑOL."
    )
    return (
        "You are a travel analyst for digital nomads.\n"
        "Generate a compact JSON analysis for each destination listed in the input.\n"
        "Return ONLY valid JSON — no markdown fences, no explanation.\n\n"
        + lang_note + "\n\n"
        "CRITICAL RULES:\n"
        "- Each entry MUST include the exact 'city' field as given.\n"
        "- All content must be factually accurate for THAT specific city.\n"
        "- Never mix information between cities.\n\n"
        + _SCHEMA
    )


def _format_dest_for_prompt(dest: Destination) -> str:
    return (
        f"=== CITY: {dest.city}, {dest.country} ===\n"
        f"Match score: {dest.match_score:.0f}/100\n"
        f"Monthly cost: ~${dest.monthly_cost_usd} USD\n"
        f"Why it matches this user: {', '.join(dest.match_reasons)}\n"
        f"Best months to visit: {', '.join(dest.climate.best_months)}\n"
        f"Visa: {dest.visa.visa_type or 'check embassy'} "
        f"({dest.visa.max_stay_days or '?'} days)\n"
        f"Local verified info: {dest.local_info or 'N/A'}\n"
    )


def _visa_summary(dest: Destination) -> str:
    if dest.visa.visa_required is False:
        return "No visa required"
    vtype = dest.visa.visa_type or "Visa"
    days = f" {dest.visa.max_stay_days}d" if dest.visa.max_stay_days else ""
    return f"{vtype}{days}"


def _dest_city(d) -> str:
    return d["city"] if isinstance(d, dict) else d.city


def _dest_country(d) -> str:
    return d["country"] if isinstance(d, dict) else d.country


def _build_result_data(state: NomadState, llm_items: list[dict]) -> dict:
    llm_by_city = {item.get("city", "").lower().strip(): item for item in llm_items}

    results = []
    for i, dest in enumerate(state.destinations):
        city = _dest_city(dest)
        country = _dest_country(dest)
        llm = (
            llm_by_city.get(city.lower().strip())
            or (llm_items[i] if i < len(llm_items) else {})
        )

        # Handle both Pydantic objects and plain dicts from LangGraph deserialization
        if isinstance(dest, dict):
            match_score     = round(dest.get("match_score", 0))
            monthly_cost    = dest.get("monthly_cost_usd")
            match_reasons   = dest.get("match_reasons", [])
            best_months     = dest.get("climate", {}).get("best_months", [])
            avoid_months    = dest.get("climate", {}).get("avoid_months", [])
            visa_type       = dest.get("visa", {}).get("visa_type")
            max_stay        = dest.get("visa", {}).get("max_stay_days")
            visa_reqs       = dest.get("visa", {}).get("requirements", [])
            visa_required   = dest.get("visa", {}).get("visa_required")
            youtube_links   = dest.get("media", {}).get("youtube_links", [])
            accommodation   = dest.get("accommodation_links", [])
        else:
            match_score     = round(dest.match_score)
            monthly_cost    = dest.monthly_cost_usd
            match_reasons   = dest.match_reasons
            best_months     = dest.climate.best_months
            avoid_months    = dest.climate.avoid_months
            visa_type       = dest.visa.visa_type
            max_stay        = dest.visa.max_stay_days
            visa_reqs       = dest.visa.requirements
            visa_required   = dest.visa.visa_required
            youtube_links   = dest.media.youtube_links
            accommodation   = dest.accommodation_links

        visa_sum = (
            "No visa required" if visa_required is False
            else f"{visa_type or 'Visa'}{f' {max_stay}d' if max_stay else ''}"
        )

        results.append({
            "rank":             i + 1,
            "city":             city,
            "country":          country,
            "match_score":      match_score,
            "monthly_cost_usd": monthly_cost,
            "match_reasons":    match_reasons,
            "tagline":          llm.get("tagline", ""),
            "ai_summary":       llm.get("ai_summary", ""),
            "why_you_why_now":  llm.get("why_you_why_now", []),
            "internet_mbps":    llm.get("internet_mbps"),
            "avg_temp_celsius": llm.get("avg_temp_celsius"),
            "security":         llm.get("security", ""),
            "community":        llm.get("community", ""),
            "visa_summary":     visa_sum,
            "visa":             {"required": visa_required, "type": visa_type, "max_stay_days": max_stay, "requirements": visa_reqs},
            "climate":          {"best_months": best_months, "avoid_months": avoid_months},
            "youtube_links":    youtube_links,
            "accommodation_links": accommodation,
        })
    return {"destinations": results}


def _result_data_to_markdown(result_data: dict) -> str:
    lines = []
    for d in result_data.get("destinations", []):
        lines += [
            f"## 🌍 {d['city']}, {d['country']}",
            f"**✨ Match: {d['match_score']}/100** · **💰 ~${d['monthly_cost_usd']} USD/mes**",
            "",
            f"*{d.get('ai_summary', '')}*",
            "",
            "### ✅ ¿Por qué encaja con tu perfil?",
        ]
        for r in d.get("match_reasons", []):
            lines.append(f"- ✓ {r}")
        lines += ["", "### 🎯 Por qué tú, por qué ahora"]
        for b in d.get("why_you_why_now", []):
            lines.append(f"- {b}")
        if d.get("youtube_links"):
            lines += ["", "### 🎬 Videos de YouTube"]
            for url in d["youtube_links"]:
                lines.append(f"[Ver video]({url})")
        lines += ["", "---", ""]

    has_acc = any(d.get("accommodation_links") for d in result_data.get("destinations", []))
    if has_acc:
        lines += ["## 🏠 Dónde alojarte", ""]
        for d in result_data.get("destinations", []):
            if d.get("accommodation_links"):
                lines.append(f"### 📍 {d['city']}, {d['country']}")
                for link in d["accommodation_links"]:
                    lines.append(f"- [{link['label']}]({link['url']})")
                lines.append("")

    return "\n".join(lines)


def compiler_node(state: NomadState, config: RunnableConfig) -> dict:
    llm = ChatGoogleGenerativeAI(
        model=settings.google_model_id,
        google_api_key=settings.google_api_key,
    )

    destinations_text = "\n\n".join(
        _format_dest_for_prompt(d if not isinstance(d, dict) else Destination(**d))
        for d in state.destinations
    )

    prompt = (
        f"User profile:\n"
        f"- Budget: ${state.user_profile.budget_usd_monthly}/mo\n"
        f"- Timezone: {state.user_profile.work_timezone}\n"
        f"- Hobbies: {', '.join(state.user_profile.hobbies)}\n"
        f"- Goals: {', '.join(state.user_profile.goals)}\n"
        f"- Nationality: {state.user_profile.nationality}\n"
        f"- Preferred climate: {state.user_profile.preferred_climate}\n\n"
        f"Destinations ({len(state.destinations)} total):\n{destinations_text}"
    )

    try:
        response = llm.invoke([SystemMessage(content=_system_prompt(state.language)), HumanMessage(content=prompt)], config=config)
        content = re.sub(r"```(?:json)?\s*|\s*```", "", response.content).strip()
        llm_items = json.loads(content).get("destinations", [])
    except Exception as e:
        logger.warning("compiler_node JSON parse failed: %s", e)
        llm_items = []

    result_data = _build_result_data(state, llm_items)
    final_report = _result_data_to_markdown(result_data)

    return {"final_report": final_report, "result_data": result_data}
