from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from app.graph.state import NomadState, Destination
from app.config import settings


_SYSTEM = """Sos un asistente experto en nómadas digitales. Generás reportes visuales, detallados y agradables.

Usá EXACTAMENTE esta estructura markdown para cada destino:

## 🌍 {Ciudad}, {País}
**✨ Afinidad: {score}/100** · **💰 ~${costo} USD/mes**

### ✅ ¿Por qué encaja con tu perfil?
- ✓ {razón 1}
- ✓ {razón 2}

### 🏄 Hobbies y estilo de vida
Para CADA hobby del usuario mencioná lugares, clubes, eventos o comunidades concretas de esa ciudad.
Usá 📍 para lugares, 🏋️/🚴/🎨 etc. según el hobby, y **nombre en negrita** para cada lugar.

### 🤝 Networking y comunidad
Coworkings, meetups, grupos de Slack/WhatsApp. Usá 💻 para coworkings, 👥 para meetups.

### ☀️ Clima y mejor época
🗓️ **Mejor época**: meses
🌡️ Temperatura y descripción breve.
⚠️ **Evitar**: meses si aplica.

### 🛂 Visa y requisitos
📋 Estado y tipo de visa.
Lista de requisitos con ✅ o ❗ según dificultad.

### 🎬 Videos de YouTube
Un link markdown por línea: [Título descriptivo del video](URL)
NO uses listas con guión para los videos, cada link va en su propia línea.

---

REGLAS IMPORTANTES:
- Usá ## para el nombre de cada ciudad (con emoji de bandera del país si la conocés)
- Usá ### para cada sección
- Emojis variados y relevantes en todo el contenido
- Links de YouTube SIEMPRE en formato markdown: [texto](URL)
- Nunca escribas "undefined"
- Cerrá el reporte completo con un párrafo motivador con emojis 🚀✈️🌟"""


def _accommodation_section(destinations: list) -> str:
    lines = ["\n---\n## 🏠 Dónde alojarte\n"]
    for dest in destinations:
        if not dest.accommodation_links:
            continue
        lines.append(f"### 📍 {dest.city}, {dest.country}\n")
        for link in dest.accommodation_links:
            lines.append(f"- [{link['label']}]({link['url']})")
        lines.append("")
    return "\n".join(lines)


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
{dest.city}, {dest.country} — Match: {dest.match_score:.0f}/100
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
    final_report = response.content + _accommodation_section(state.destinations)
    return {"final_report": final_report}
