from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from app.graph.state import NomadState, Destination
from app.config import settings


_SYSTEM = """Sos un asistente experto en nómadas digitales. Generás reportes claros, amigables y útiles.
Cuando recibas datos de destinos recomendados, armalos en un reporte en español con esta estructura por destino:

1. Nombre del destino + score de afinidad + costo mensual
2. Por qué encaja con el perfil (usá los match_reasons que te doy, no los inventes)
3. Sección "🏃 Hobbies y estilo de vida": para CADA hobby del usuario, mencioná lugares concretos,
   ligas, clubes, eventos o comunidades específicas de esa ciudad. Sé detallado.
4. Sección "🤝 Networking y comunidad": comunidades de nómadas digitales activas, coworkings populares,
   meetups, grupos de Slack/WhatsApp/Facebook conocidos en esa ciudad. Mencioná nombres reales.
5. Mejor época para visitar + clima
6. Info de visa
7. Videos de YouTube (formateá cada URL como un link markdown: [Mirá este video](URL))

Importante:
- Los links de YouTube SIEMPRE en formato markdown: [texto descriptivo](https://youtube.com/...)
- Nunca uses la palabra "undefined"
- Usá emojis y markdown para que sea visualmente agradable
- Cierre motivador al final del reporte completo"""


def _format_destination(dest: Destination) -> str:
    youtube = "\n".join(f"  - {url}" for url in dest.media.youtube_links) or "  - No disponible"
    requirements = "\n".join(f"  - {r}" for r in dest.visa.requirements) or "  - Consultar embajada"
    best_months = ", ".join(dest.climate.best_months) or "No disponible"
    avoid_months = ", ".join(dest.climate.avoid_months) or "No disponible"

    visa_status = "No requerida" if dest.visa.visa_required is False else (
        f"{dest.visa.visa_type} ({dest.visa.max_stay_days} días)" if dest.visa.visa_required else "Consultar"
    )

    local_info_section = f"\nInformación local verificada:\n{dest.local_info}" if dest.local_info else ""

    return f"""
**{dest.city}, {dest.country}** — Match: {dest.match_score:.0f}/100
Costo mensual estimado: ~${dest.monthly_cost_usd} USD

Por qué encaja con tu perfil:
{chr(10).join(f"  ✓ {r}" for r in dest.match_reasons)}
{local_info_section}
Clima:
  Mejor época: {best_months}
  Evitar: {avoid_months}

Visa ({dest.visa.visa_type or "info"}): {visa_status}
  Requisitos:
{requirements}

Videos YouTube:
{youtube}
"""


def compiler_node(state: NomadState) -> dict:
    llm = ChatGoogleGenerativeAI(
        model=settings.google_model_id,
        google_api_key=settings.google_api_key,
    )

    destinations_text = "\n---\n".join(_format_destination(d) for d in state.destinations)

    prompt = f"""Generá el reporte final para el usuario nómada digital con estos destinos recomendados:

{destinations_text}

Perfil del usuario:
- Presupuesto: ${state.user_profile.budget_usd_monthly}/mes
- Zona horaria: {state.user_profile.work_timezone}
- Hobbies: {state.user_profile.hobbies}
- Objetivos: {state.user_profile.goals}"""

    response = llm.invoke([SystemMessage(content=_SYSTEM), HumanMessage(content=prompt)])
    return {"final_report": response.content}
