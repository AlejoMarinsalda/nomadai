from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from app.graph.state import NomadState, Destination
from app.config import settings
from app.utils import extract_json


_SYSTEM = """Eres un experto en destinos para nómadas digitales.
Dado el perfil del usuario, recomendá exactamente 3 destinos.

Considerá:
- Afinidad con hobbies e intereses
- Presupuesto mensual disponible
- Compatibilidad de zona horaria con trabajo remoto
- Estilo de vida y objetivos
- Clima preferido

Para las match_reasons sé MUY específico. En vez de frases genéricas como "buena comunidad de nómadas",
usá detalles concretos como:
- Hobbies deportivos: ligas amateur, clubes, instalaciones conocidas (ej: "Torneos de fútbol 5 en El Poblado cada fin de semana")
- Juegos/entretenimiento: nombres de casinos o salas de póker en vivo reconocidas de esa ciudad
- Networking: nombres de coworkings populares, comunidades de nómadas activas, meetups regulares
- Idiomas: ambientes específicos de inmersión en inglés (barrios, comunidades expatriadas, eventos)

Respondé ÚNICAMENTE con un JSON array con este formato, sin texto adicional:
[
  {
    "city": "nombre ciudad",
    "country": "país",
    "match_score": 92.5,
    "match_reasons": ["razón 1 concreta", "razón 2 concreta"],
    "monthly_cost_usd": 1200
  }
]"""


def destination_node(state: NomadState) -> dict:
    llm = ChatGoogleGenerativeAI(
        model=settings.google_model_id,
        google_api_key=settings.google_api_key,
    )

    profile = state.user_profile
    prompt = f"""Perfil del usuario:
- Hobbies: {profile.hobbies}
- Presupuesto mensual: ${profile.budget_usd_monthly} USD
- Zona horaria de trabajo: {profile.work_timezone}
- Nacionalidad: {profile.nationality}
- Objetivos: {profile.goals}
- Clima preferido: {profile.preferred_climate}

Recomendá 3 destinos ideales para este perfil."""

    response = llm.invoke([SystemMessage(content=_SYSTEM), HumanMessage(content=prompt)])

    data = extract_json(response.content)
    if isinstance(data, list) and data:
        try:
            destinations = [Destination(**d) for d in data]
            return {"destinations": destinations}
        except (KeyError, TypeError) as e:
            return {"error": f"Error building destinations: {e}"}

    return {"error": f"No se pudo parsear destinos. Respuesta: {response.content[:200]}"}
