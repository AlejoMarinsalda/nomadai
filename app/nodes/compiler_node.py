import json
import re
import logging
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from app.graph.state import NomadState, Destination
from app.config import settings

logger = logging.getLogger(__name__)

# ── LLM prompt ────────────────────────────────────────────────────────────────

_SYSTEM = """You are a travel analyst for digital nomads.
Generate a compact JSON analysis for each destination listed in the input.
Return ONLY valid JSON — no markdown fences, no explanation, nothing else.

CRITICAL: Each entry in your response MUST include the exact "city" field as given in the input.
All content (tagline, bullets, summary) must be factually accurate for THAT specific city.
Never mix information between cities.

For each destination produce:
{
  "city": "exact city name from input",
  "tagline": "3-5 words describing THIS city's vibe (must be geographically/culturally accurate)",
  "ai_summary": "1-2 sentences about THIS city tailored to the user's specific profile",
  "why_you_why_now": [
    "bullet 1 specific to THIS city and user (max 10 words)",
    "bullet 2 specific to THIS city and user (max 10 words)",
    "bullet 3 specific to THIS city and user (max 10 words)",
    "bullet 4 specific to THIS city and user (max 10 words)"
  ],
  "internet_mbps": <realistic estimate for this city>,
  "avg_temp_celsius": <realistic average for this city>,
  "security": "Excelente | Buena | Moderada",
  "community": "Muy alta | Alta | Media"
}

Return format: {"destinations": [...]}
"""


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


def _build_result_data(state: NomadState, llm_items: list[dict]) -> dict:
    # Match LLM output to destinations by city name to avoid ordering mismatches
    llm_by_city = {item.get("city", "").lower().strip(): item for item in llm_items}

    results = []
    for i, dest in enumerate(state.destinations):
        llm = (
            llm_by_city.get(dest.city.lower().strip())
            or (llm_items[i] if i < len(llm_items) else {})
        )
        results.append({
            "rank":             i + 1,
            "city":             dest.city,
            "country":          dest.country,
            "match_score":      round(dest.match_score),
            "monthly_cost_usd": dest.monthly_cost_usd,
            "match_reasons":    dest.match_reasons,
            "tagline":          llm.get("tagline", ""),
            "ai_summary":       llm.get("ai_summary", ""),
            "why_you_why_now":  llm.get("why_you_why_now", []),
            "internet_mbps":    llm.get("internet_mbps"),
            "avg_temp_celsius": llm.get("avg_temp_celsius"),
            "security":         llm.get("security", ""),
            "community":        llm.get("community", ""),
            "visa_summary":     _visa_summary(dest),
            "visa": {
                "type":          dest.visa.visa_type,
                "max_stay_days": dest.visa.max_stay_days,
                "requirements":  dest.visa.requirements,
            },
            "climate": {
                "best_months":  dest.climate.best_months,
                "avoid_months": dest.climate.avoid_months,
            },
            "youtube_links":       dest.media.youtube_links,
            "accommodation_links": dest.accommodation_links,
        })
    return {"destinations": results}


def _result_data_to_markdown(result_data: dict) -> str:
    """Auto-generate markdown from structured data (for chat backward compat)."""
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


def compiler_node(state: NomadState) -> dict:
    llm = ChatGoogleGenerativeAI(
        model=settings.google_model_id,
        google_api_key=settings.google_api_key,
    )

    destinations_text = "\n\n".join(_format_dest_for_prompt(d) for d in state.destinations)
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
        response = llm.invoke([SystemMessage(content=_SYSTEM), HumanMessage(content=prompt)])
        content = re.sub(r"```(?:json)?\s*|\s*```", "", response.content).strip()
        llm_items = json.loads(content).get("destinations", [])
    except Exception as e:
        logger.warning("compiler_node JSON parse failed: %s", e)
        llm_items = []

    result_data = _build_result_data(state, llm_items)
    final_report = _result_data_to_markdown(result_data)

    return {"final_report": final_report, "result_data": result_data}
