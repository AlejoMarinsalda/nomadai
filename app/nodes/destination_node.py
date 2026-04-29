import re
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

3. **Zona horaria**: Si se especifica una zona horaria de trabajo, la diferencia con el destino
   no debe superar 6 horas. Los rangos aceptables se indican en los filtros del usuario.

## REGLA DE FALLBACK (importante)

Si no encontrás 3 destinos que cumplan TODOS los filtros obligatorios, retorná de todas formas
los 3 mejores disponibles aunque no cumplan todos los filtros. En ese caso:
- Bajá el match_score proporcionalmente (puede ser menor a 60)
- En match_reasons explicá explícitamente qué filtro no pudo cumplirse y por qué

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
- Zona horaria: diferencia horaria exacta y si es viable para el horario de trabajo del usuario"""


_LANGUAGE_GOALS = {"inglés", "ingles", "english", "inmersión en inglés", "inmersion en ingles"}
_MAX_TZ_DIFF_HOURS = 6


def _has_english_goal(goals: list[str]) -> bool:
    goals_lower = " ".join(goals).lower()
    return any(kw in goals_lower for kw in _LANGUAGE_GOALS)


def _parse_utc_offset(tz: str | None) -> float | None:
    """Parsea 'UTC-3', 'UTC+5:30', 'GMT+1' a horas numéricas. Retorna None si no reconoce el formato."""
    if not tz:
        return None
    tz = tz.strip().upper()
    if tz in ("UTC", "GMT"):
        return 0.0
    match = re.match(r"(?:UTC|GMT)([+-])(\d{1,2})(?::(\d{2}))?$", tz)
    if match:
        sign = 1 if match.group(1) == "+" else -1
        hours = int(match.group(2))
        minutes = int(match.group(3) or "0")
        return sign * (hours + minutes / 60)
    return None


def _timezone_constraint(work_timezone: str | None) -> str | None:
    offset = _parse_utc_offset(work_timezone)
    if offset is None:
        return None
    lo = int(offset - _MAX_TZ_DIFF_HOURS)
    hi = int(offset + _MAX_TZ_DIFF_HOURS)
    lo_str = f"UTC{lo:+d}"
    hi_str = f"UTC{hi:+d}"
    return (
        f"⚠️ ZONA HORARIA OBLIGATORIA: El usuario trabaja en {work_timezone}. "
        f"La diferencia horaria con el destino no debe superar {_MAX_TZ_DIFF_HOURS} horas. "
        f"Rango aceptable: {lo_str} a {hi_str}. "
        f"EXCLUIR destinos fuera de este rango (p.ej. si el usuario es UTC-3, quedan EXCLUIDOS destinos en UTC+4 o más)."
    )


def destination_node(state: NomadState) -> dict:
    llm = ChatGoogleGenerativeAI(
        model=settings.google_model_id,
        google_api_key=settings.google_api_key,
    )

    profile = state.user_profile

    constraints = []
    if _has_english_goal(profile.goals or []):
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

    tz_constraint = _timezone_constraint(profile.work_timezone)
    if tz_constraint:
        constraints.append(tz_constraint)

    constraint_block = "\n".join(constraints)

    prompt = f"""Perfil del usuario:
- Nacionalidad: {profile.nationality}
- Hobbies: {", ".join(profile.hobbies) if profile.hobbies else "no especificado"}
- Presupuesto mensual: ${profile.budget_usd_monthly} USD
- Zona horaria de trabajo: {profile.work_timezone}
- Objetivos: {", ".join(profile.goals) if profile.goals else "no especificado"}
- Clima preferido: {profile.preferred_climate or "sin preferencia"}

{constraint_block}

Recomendá exactamente 3 destinos. Si no hay 3 que cumplan todos los filtros, retorná
los mejores disponibles con match_score reducido y la razón del incumplimiento en match_reasons."""

    response = llm.invoke([SystemMessage(content=_SYSTEM), HumanMessage(content=prompt)])

    data = extract_json(response.content)
    if isinstance(data, list) and data:
        try:
            destinations = [Destination(**d) for d in data]
            return {"destinations": destinations}
        except (KeyError, TypeError) as e:
            return {"error": f"Error building destinations: {e}"}

    return {"error": f"No se pudo parsear destinos. Respuesta: {response.content[:200]}"}
