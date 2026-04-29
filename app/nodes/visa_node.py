from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from app.graph.state import NomadState, VisaInfo
from app.tools.search_tool import search_web
from app.config import settings
from app.utils import extract_json


_SYSTEM = """Sos un experto en requisitos de visa y trámites migratorios para nómadas digitales.
Dado el destino y la nacionalidad, buscá información sobre:
- Si necesita visa o no
- Tipo de visa disponible (turista, nómada digital, etc.)
- Días máximos de estadía sin visa
- Requisitos principales (pasaporte vigente, seguro, etc.)
- URL oficial o fuente confiable

Respondé ÚNICAMENTE con JSON sin texto adicional:
{
  "visa_required": true,
  "visa_type": "nombre del tipo de visa",
  "max_stay_days": 90,
  "requirements": ["req 1", "req 2"],
  "source_url": "https://..."
}"""


def visa_node(state: NomadState) -> dict:
    llm = ChatGoogleGenerativeAI(
        model=settings.google_model_id,
        google_api_key=settings.google_api_key,
    )
    nationality = state.user_profile.nationality
    updated_destinations = []

    for destination in state.destinations:
        search_results = search_web(
            f"visa requirements {nationality} citizens {destination.country} digital nomad 2024"
        )
        context = "\n".join(search_results[:3]) if search_results else "Sin resultados de búsqueda."

        prompt = f"""Nacionalidad del viajero: {nationality}
Destino: {destination.city}, {destination.country}

Información encontrada en web:
{context}

Respondé el JSON de requisitos de visa."""

        response = llm.invoke([SystemMessage(content=_SYSTEM), HumanMessage(content=prompt)])

        data = extract_json(response.content)
        visa = VisaInfo(**data) if isinstance(data, dict) else VisaInfo()
        updated_destinations.append(destination.model_copy(update={"visa": visa}))

    return {"destinations": updated_destinations}
