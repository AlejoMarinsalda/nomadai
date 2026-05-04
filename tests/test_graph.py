import pytest
from unittest.mock import patch, MagicMock
from langchain_core.messages import HumanMessage, AIMessage

from app.graph.state import NomadState, UserProfile, Destination


@pytest.fixture
def complete_profile():
    return UserProfile(
        hobbies=["surf", "fotografía", "café"],
        budget_usd_monthly=2000,
        work_timezone="UTC-5",
        nationality="Argentina",
        goals=["aventura", "networking"],
        preferred_climate="tropical",
    )


def test_preferred_climate_coerces_list():
    profile = UserProfile(preferred_climate=["templado", "tropical"])
    assert profile.preferred_climate == "templado, tropical"


def test_preferred_climate_accepts_string():
    profile = UserProfile(preferred_climate="tropical")
    assert profile.preferred_climate == "tropical"


@pytest.fixture
def sample_destinations():
    return [
        Destination(
            city="Medellín",
            country="Colombia",
            match_score=91.0,
            match_reasons=["Clima ideal", "Bajo costo", "Comunidad nomad activa"],
            monthly_cost_usd=1200,
        )
    ]


def test_state_defaults():
    state = NomadState()
    assert state.profile_complete is False
    assert state.destinations == []
    assert state.final_report is None


def test_user_profile_serialization(complete_profile):
    data = complete_profile.model_dump()
    restored = UserProfile(**data)
    assert restored.nationality == "Argentina"
    assert restored.budget_usd_monthly == 2000


def test_destination_match_score_bounds():
    with pytest.raises(Exception):
        Destination(city="Test", country="Test", match_score=150)
