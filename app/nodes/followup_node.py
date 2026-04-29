from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from app.graph.state import NomadState
from app.config import settings


_SYSTEM = """Sos un asistente experto en viajes para nómadas digitales.
Ya recomendaste destinos al usuario y generaste un reporte completo.
El usuario te hace una pregunta de seguimiento sobre esos destinos.

IMPORTANTE:
- Tenés el reporte completo y la lista de destinos recomendados en el contexto.
- Respondé SOLO sobre los destinos que ya recomendaste.
- NO pidas al usuario que te diga destinos — vos ya los elegiste.
- NO pidas más información del perfil — ya lo tenés completo.
- Respondé en español de forma conversacional y útil."""


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
        SystemMessage(content=_SYSTEM),
        HumanMessage(content=context),
        last_user_msg,
    ])

    return {"messages": [response]}
