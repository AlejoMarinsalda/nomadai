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

_RETURNING_SYSTEM = """Sos un asistente para nómadas digitales. El usuario ya tiene un perfil guardado y está iniciando una nueva búsqueda.

Tu tarea:
1. Mostrá su perfil brevemente (2-3 líneas)
2. Preguntá si quiere buscar destinos con esos datos o cambiar algo

Si el usuario CONFIRMA que quiere buscar (dice "sí", "dale", "busca", "quiero destinos", "nuevos destinos", "explorar", etc.) respondé ÚNICAMENTE:
{"search": true}

Si el usuario quiere CAMBIAR algo del perfil, recopilá los cambios. Cuando tengas todos los datos completos respondé ÚNICAMENTE:
{"profile_complete": true, "hobbies": [], "budget_usd_monthly": 0, "work_timezone": "", "nationality": "", "goals": [], "preferred_climate": ""}

Respondé siempre en español de forma conversacional."""


def profile_node(state: NomadState) -> dict:
    if state.profile_complete:
        return {}

    llm = ChatGoogleGenerativeAI(
        model=settings.google_model_id,
        google_api_key=settings.google_api_key,
    )

    p = state.user_profile
    is_returning = bool(p and p.hobbies and p.budget_usd_monthly and p.work_timezone and p.nationality)

    if is_returning:
        profile_summary = (
            f"- Hobbies: {', '.join(p.hobbies)}\n"
            f"- Presupuesto: ${p.budget_usd_monthly}/mes\n"
            f"- Zona horaria: {p.work_timezone}\n"
            f"- Nacionalidad: {p.nationality}\n"
            f"- Objetivos: {', '.join(p.goals or [])}\n"
            f"- Clima preferido: {p.preferred_climate or 'no especificado'}"
        )
        messages = [
            SystemMessage(content=_RETURNING_SYSTEM),
            HumanMessage(content=f"Perfil actual:\n{profile_summary}"),
        ] + state.messages

        response = llm.invoke(messages)
        data = extract_json(response.content)

        if isinstance(data, dict):
            if data.get("search"):
                # User confirmed — trigger destination pipeline (no new message added)
                return {"profile_complete": True}
            if data.get("profile_complete"):
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

    # New user — collect profile conversationally
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
