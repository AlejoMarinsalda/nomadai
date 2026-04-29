"""
Fixtures compartidos.

pytest_configure parchea AWS ANTES de que cualquier módulo de la app se importe,
evitando que DynamoDBSaver intente conectarse a AWS durante la recolección de tests.
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch


def pytest_configure(config):
    """Corre antes de la recolección de tests — parchea AWS y deps de Lambda globalmente."""
    import sys
    from langgraph.checkpoint.memory import MemorySaver
    # mangum solo existe en el contenedor Lambda, no en el entorno de desarrollo
    sys.modules.setdefault("mangum", MagicMock())
    # DynamoDBSaver se reemplaza por MemorySaver: mismo contrato, sin AWS
    patch("langgraph_checkpoint_aws.DynamoDBSaver", lambda **kwargs: MemorySaver()).start()
    patch("boto3.client", return_value=MagicMock()).start()
    patch("boto3.resource", return_value=MagicMock()).start()


# ---------------------------------------------------------------------------
# Fixtures de datos — imports de app DENTRO del fixture (no a nivel de módulo)
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_profile():
    from app.graph.state import UserProfile
    return UserProfile(
        hobbies=["fútbol", "poker"],
        budget_usd_monthly=2000,
        work_timezone="UTC-3",
        nationality="argentina",
        goals=["networking", "inglés"],
        preferred_climate="templado",
    )


@pytest.fixture
def sample_destination():
    from app.graph.state import Destination, DestinationMedia, ClimateInfo, VisaInfo
    return Destination(
        city="Medellín",
        country="Colombia",
        match_score=92.0,
        match_reasons=["Clima ideal", "Comunidad nomad activa"],
        monthly_cost_usd=1200,
        media=DestinationMedia(youtube_links=["https://youtube.com/watch?v=abc"]),
        climate=ClimateInfo(best_months=["Dic", "Ene"], avoid_months=["Nov"]),
        visa=VisaInfo(visa_required=False, max_stay_days=180),
    )


@pytest.fixture
def complete_state(sample_profile, sample_destination):
    from langchain_core.messages import HumanMessage
    from app.graph.state import NomadState
    return NomadState(
        messages=[HumanMessage(content="Quiero viajar como nómada")],
        user_profile=sample_profile,
        profile_complete=True,
        destinations=[sample_destination],
    )


# ---------------------------------------------------------------------------
# Mock de DynamoDB reutilizable
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_dynamodb():
    db = MagicMock()
    db.put_item.return_value = {}
    db.get_item.return_value = {"Item": None}
    db.delete_item.return_value = {}
    return db


# ---------------------------------------------------------------------------
# Cliente FastAPI con servicios mockeados
# ---------------------------------------------------------------------------

@pytest.fixture
def api_client(mock_dynamodb):
    from langchain_core.messages import AIMessage
    from app.graph.state import UserProfile

    mock_graph = MagicMock()
    mock_graph.aget_state = AsyncMock(return_value=MagicMock(values={}))
    mock_graph.ainvoke = AsyncMock(return_value={
        "messages": [AIMessage(content="Respuesta de prueba")],
        "final_report": None,
        "profile_complete": False,
        "user_profile": UserProfile(),
    })

    with patch("app.api.main.graph", mock_graph), \
         patch("app.services.rag_store._load", return_value=None), \
         patch("app.services.job_store._db", return_value=mock_dynamodb), \
         patch("app.services.profile_store._db", return_value=mock_dynamodb):

        from fastapi.testclient import TestClient
        from app.api.main import app
        from app.services.auth import get_current_user
        from app.services.rate_limiter import rate_limit
        app.dependency_overrides[get_current_user] = lambda: "test-user-1"
        app.dependency_overrides[rate_limit] = lambda: "test-user-1"
        try:
            with TestClient(app, raise_server_exceptions=True) as client:
                yield client, mock_graph, mock_dynamodb
        finally:
            app.dependency_overrides.pop(get_current_user, None)
            app.dependency_overrides.pop(rate_limit, None)
