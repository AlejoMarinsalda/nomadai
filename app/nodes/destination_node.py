from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from app.graph.state import NomadState, Destination
from app.config import settings
from app.utils import extract_json


_SYSTEM = """Sos un experto en destinos para nómadas digitales.
Tu tarea es recomendar exactamente 3 destinos que cumplan el perfil del usuario.

## REGLAS DE FILTRADO (no negociables)

Antes de recomendar cualquier destino, aplicá estos filtros estrictos:

1. **Inmersión en inglés**: Si el usuario menciona "inglés", "english", "inmersión en inglés" o similar
   en sus objetivos → SOLO recomendá países donde el inglés sea lengua oficial o predominante
   (Irlanda, Malta, Reino Unido, Canadá, Australia, Nueva Zelanda, Sudáfrica, Singapur, etc.).
   Quedán EXCLUIDOS: España, Colombia, México, Argentina, Portugal, Francia, Tailandia, etc.

2. **Presupuesto**: El costo mensual estimado DEBE ser menor o igual al presupuesto declarado.
   Un destino que supera el presupuesto está automáticamente descartado.

3. **Zona horaria**: Si el usuario trabaja en horario de Buenos Aires (UTC-3), priorizá destinos
   con diferencia máxima de ±5 horas. Para inmersión en inglés esto puede flexibilizarse,
   pero mencionalo explícitamente en match_reasons.

## FORMATO DE RESPUESTA

Respondé ÚNICAMENTE con un JSON array, sin texto adicional:
[
  {
    "city": "nombre ciudad",
    "country": "país",
    "match_score": 92.5,
    "match_reasons": ["razón concreta 1", "razón concreta 2"],
    "monthly_cost_usd": 1200
  }
]

## MATCH_REASONS — sé específico

Nunca uses frases genéricas como "buena comunidad de nómadas". En cambio:
- Hobbies deportivos: ligas, clubes o instalaciones conocidas de esa ciudad
- Poker: nombres de casinos o salas de póker en vivo
- Networking: nombres de coworkings populares, comunidades activas
- Inglés: por qué ese destino es ideal para inmersión (acento, comunidad expat, escuelas, etc.)
- Zona horaria: diferencia horaria exacta con Buenos Aires y si es viable"""


_LANGUAGE_GOALS = {"inglés", "ingles", "english", "inmersión en inglés", "inmersion en ingles"}


def _has_english_goal(goals: list[str]) -> bool:
    goals_lower = " ".join(goals).lower()
    return any(kw in goals_lower for kw in _LANGUAGE_GOALS)


def destination_node(state: NomadState) -> dict:
    llm = ChatGoogleGenerativeAI(
        model=settings.google_model_id,
        google_api_key=settings.google_api_key,
    )

    profile = state.user_profile
    english_goal = _has_english_goal(profile.goals or [])

    constraints = []
    if english_goal:
        constraints.append(
            "⚠️ FILTRO OBLIGATORIO: El usuario quiere INMERSIÓN EN INGLÉS. "
            "Solo recomendá países de habla inglesa oficial. "
            "Quedan EXCLUIDOS Colombia, México, España, Portugal, Francia, Tailandia y cualquier país no anglófono."
        )

    if profile.budget_usd_monthly:
        constraints.append(
            f"⚠️ PRESUPUESTO MÁXIMO: ${profile.budget_usd_monthly} USD/mes. "
            "No recomendés destinos que superen este monto."
        )

    constraint_block = "\n".join(constraints)

    prompt = f"""Perfil del usuario:
- Nacionalidad: {profile.nationality}
- Hobbies: {", ".join(profile.hobbies) if profile.hobbies else "no especificado"}
- Presupuesto mensual: ${profile.budget_usd_monthly} USD
- Zona horaria de trabajo: {profile.work_timezone}
- Objetivos: {", ".join(profile.goals) if profile.goals else "no especificado"}
- Clima preferido: {profile.preferred_climate or "sin preferencia"}

{constraint_block}

Recomendá exactamente 3 destinos que cumplan TODOS los filtros anteriores."""

    response = llm.invoke([SystemMessage(content=_SYSTEM), HumanMessage(content=prompt)])

    data = extract_json(response.content)
    if isinstance(data, list) and data:
        try:
            destinations = [Destination(**d) for d in data]
            return {"destinations": destinations}
        except (KeyError, TypeError) as e:
            return {"error": f"Error building destinations: {e}"}

    return {"error": f"No se pudo parsear destinos. Respuesta: {response.content[:200]}"}
