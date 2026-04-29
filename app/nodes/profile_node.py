from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from app.graph.state import NomadState, UserProfile
from app.config import settings
from app.utils import extract_json


_SYSTEM = """Eres un asistente que ayuda a nómadas digitales a encontrar su próximo destino.
Tu tarea es recopilar el perfil del usuario haciendo preguntas conversacionales.

Necesitás obtener EXACTAMENTE estos datos:
1. hobbies e intereses
2. presupuesto mensual en USD (número)
3. zona horaria de trabajo
4. nacionalidad
5. objetivos del viaje (aventura, networking, descanso, etc.)
6. preferencia de clima

IMPORTANTE: Cuando tengas los 6 datos anteriores, respondé ÚNICAMENTE con este JSON sin ningún texto adicional antes ni después:
{"profile_complete": true, "hobbies": [], "budget_usd_monthly": 0, "work_timezone": "", "nationality": "", "goals": [], "preferred_climate": ""}

Si falta algún dato, seguí la conversación en español de forma amigable preguntando solo lo que falta.
NO pidas información sobre destinos — eso es tu trabajo recomendarlos."""


def profile_node(state: NomadState) -> dict:
    if state.profile_complete:
        return {}

    llm = ChatGoogleGenerativeAI(
        model=settings.google_model_id,
        google_api_key=settings.google_api_key,
    )

    messages = [SystemMessage(content=_SYSTEM)] + state.messages
    response = llm.invoke(messages)

    data = extract_json(response.content)
    if isinstance(data, dict) and data.get("profile_complete"):
        profile = UserProfile(
            hobbies=data.get("hobbies", []),
            budget_usd_monthly=data.get("budget_usd_monthly"),
            work_timezone=data.get("work_timezone"),
            nationality=data.get("nationality"),
            goals=data.get("goals", []),
            preferred_climate=data.get("preferred_climate"),
        )
        return {"user_profile": profile, "profile_complete": True, "messages": [response]}

    return {"messages": [response]}
