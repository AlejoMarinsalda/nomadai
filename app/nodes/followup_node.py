from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from app.graph.state import NomadState
from app.config import settings


def _system(language: str) -> str:
    lang = (
        "Always respond in English, regardless of any other language in the context."
        if language.startswith("en")
        else "Respondé siempre en español, de forma conversacional y útil."
    )
    return f"""You are a travel expert assistant for digital nomads.
You already recommended destinations to the user and generated a full report.
The user is asking a follow-up question about those destinations.

IMPORTANT:
- You have the full report and recommended destinations list in context.
- Answer ONLY about the destinations you already recommended.
- Do NOT ask the user for destinations — you already chose them.
- Do NOT ask for more profile info — you already have it.
- {lang}"""


def followup_node(state: NomadState) -> dict:
    llm = ChatGoogleGenerativeAI(
        model=settings.google_model_id,
        google_api_key=settings.google_api_key,
    )

    destinations_summary = (
        "\n".join(
            f"- {d.city}, {d.country} (score: {d.match_score}/100, ~${d.monthly_cost_usd}/mes)"
            for d in state.destinations
        )
        if state.destinations
        else "Ver destinos en el reporte completo abajo."
    )

    context = f"""Perfil del usuario:
- Hobbies: {state.user_profile.hobbies}
- Presupuesto: ${state.user_profile.budget_usd_monthly}/mes
- Zona horaria: {state.user_profile.work_timezone}
- Nacionalidad: {state.user_profile.nationality}
- Objetivos: {state.user_profile.goals}

Destinos que YA recomendaste:
{destinations_summary}

Reporte completo que generaste:
{state.final_report}
"""

    # Solo usamos el último mensaje del usuario, no todo el historial
    last_user_msg = next(
        (m for m in reversed(state.messages) if isinstance(m, HumanMessage)),
        HumanMessage(content=""),
    )

    response = llm.invoke([
        SystemMessage(content=_system(state.language)),
        HumanMessage(content=context),
        last_user_msg,
    ])

    return {"messages": [response]}
