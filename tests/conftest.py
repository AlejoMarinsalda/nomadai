"""
Fixtures compartidos. Parchea AWS y Google antes de que el app se importe
para que los tests corran sin credenciales reales.
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from langchain_core.messages import AIMessage

from app.graph.state import (
    NomadState, UserProfile, Destination,
    DestinationMedia, ClimateInfo, VisaInfo,
)


# ---------------------------------------------------------------------------
# Fixtures de datos
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_profile():
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
    return NomadState(
        messages=[HumanMessage(content="Quiero viajar como nómada")],
        user_profile=sample_profile,
        profile_complete=True,
        destinations=[sample_destination],
    )


# ---------------------------------------------------------------------------
# Mock del cliente DynamoDB (reutilizable entre tests)
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_dynamodb():
    db = MagicMock()
    db.put_item.return_value = {}
    db.get_item.return_value = {"Item": None}
    db.delete_item.return_value = {}
    return db


# ---------------------------------------------------------------------------
# Cliente FastAPI con dependencias mockeadas
# ---------------------------------------------------------------------------

@pytest.fixture
def api_client(mock_dynamodb):
    """TestClient con AWS y LangGraph mockeados."""
    mock_graph = MagicMock()
    mock_graph.aget_state = AsyncMock(return_value=MagicMock(values={}))
    mock_graph.ainvoke = AsyncMock(return_value={
        "messages": [AIMessage(content="Respuesta de prueba")],
        "final_report": None,
        "profile_complete": False,
        "user_profile": UserProfile(),
    })

    with patch("boto3.client", return_value=mock_dynamodb), \
         patch("boto3.resource", return_value=MagicMock()), \
         patch("langgraph_checkpoint_aws.DynamoDBSaver", return_value=MagicMock()), \
         patch("app.api.main.graph", mock_graph), \
         patch("app.services.rag_store._load", return_value=None), \
         patch("app.services.job_store._db", return_value=mock_dynamodb), \
         patch("app.services.profile_store._db", return_value=mock_dynamodb):

        from fastapi.testclient import TestClient
        from app.api.main import app
        with TestClient(app, raise_server_exceptions=True) as client:
            yield client, mock_graph, mock_dynamodb
