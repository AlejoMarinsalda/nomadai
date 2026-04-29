"""Tests de los nodos del grafo LangGraph."""

import pytest
from unittest.mock import patch, MagicMock
from langchain_core.messages import HumanMessage, AIMessage

from app.graph.state import NomadState, UserProfile, Destination, DestinationMedia, ClimateInfo, VisaInfo


class TestProfileNode:
    def test_skips_when_profile_complete(self, complete_state):
        from app.nodes.profile_node import profile_node
        complete_state.profile_complete = True
        result = profile_node(complete_state)
        assert result == {}

    def test_extracts_profile_from_json_response(self, sample_profile):
        from app.nodes.profile_node import profile_node
        import json

        profile_json = json.dumps({
            "profile_complete": True,
            "hobbies": ["fútbol", "poker"],
            "budget_usd_monthly": 2000,
            "work_timezone": "UTC-3",
            "nationality": "argentina",
            "goals": ["networking"],
            "preferred_climate": "templado",
        })

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content=profile_json)

        state = NomadState(messages=[HumanMessage(content="soy argentino...")])

        with patch("app.nodes.profile_node.ChatGoogleGenerativeAI", return_value=mock_llm):
            result = profile_node(state)

        assert result["profile_complete"] is True
        assert result["user_profile"].nationality == "argentina"
        assert result["user_profile"].budget_usd_monthly == 2000

    def test_returns_message_when_profile_incomplete(self):
        from app.nodes.profile_node import profile_node

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="¿Cuál es tu presupuesto?")

        state = NomadState(messages=[HumanMessage(content="Hola")])

        with patch("app.nodes.profile_node.ChatGoogleGenerativeAI", return_value=mock_llm):
            result = profile_node(state)

        assert "messages" in result
        assert "profile_complete" not in result


class TestDestinationNode:
    def test_returns_destinations(self, complete_state):
        from app.nodes.destination_node import destination_node
        import json

        destinations_json = json.dumps([{
            "city": "Medellín",
            "country": "Colombia",
            "match_score": 92,
            "match_reasons": ["Clima ideal"],
            "monthly_cost_usd": 1200,
        }])

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content=destinations_json)

        with patch("app.nodes.destination_node.ChatGoogleGenerativeAI", return_value=mock_llm):
            result = destination_node(complete_state)

        assert len(result["destinations"]) == 1
        assert result["destinations"][0].city == "Medellín"
        assert result["destinations"][0].match_score == 92


class TestCompilerNode:
    def test_generates_final_report(self, complete_state):
        from app.nodes.compiler_node import compiler_node

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="# Tu reporte de nómada\n\nMedellín es perfecto para vos.")

        with patch("app.nodes.compiler_node.ChatGoogleGenerativeAI", return_value=mock_llm):
            result = compiler_node(complete_state)

        assert result["final_report"]
        assert "Medellín" in result["final_report"]

    def test_includes_local_info_when_present(self, complete_state, sample_destination):
        from app.nodes.compiler_node import compiler_node, _format_destination

        sample_destination.local_info = "HOBBIES: Futbol 5 El Estadio\nNETWORKING: Selina Medellín"
        formatted = _format_destination(sample_destination)

        assert "Futbol 5 El Estadio" in formatted
        assert "Selina Medellín" in formatted


class TestEnrichmentNode:
    def test_runs_all_enrichments_in_parallel(self, complete_state):
        import asyncio
        from app.nodes.enrichment_node import enrichment_node

        mock_media = DestinationMedia(youtube_links=["https://youtube.com/watch?v=abc"])
        mock_climate = ClimateInfo(best_months=["Dic", "Ene"])
        mock_visa = VisaInfo(visa_required=False, max_stay_days=180)

        with patch("app.nodes.enrichment_node._enrich_media", return_value=mock_media), \
             patch("app.nodes.enrichment_node._enrich_climate", return_value=mock_climate), \
             patch("app.nodes.enrichment_node._enrich_visa", return_value=mock_visa), \
             patch("app.nodes.enrichment_node._enrich_local_info", return_value="info local"), \
             patch("app.services.rag_store._load", return_value=None):
            result = asyncio.run(enrichment_node(complete_state))

        assert len(result["destinations"]) == 1
        dest = result["destinations"][0]
        assert dest.media.youtube_links == ["https://youtube.com/watch?v=abc"]
        assert dest.climate.best_months == ["Dic", "Ene"]
        assert dest.visa.visa_required is False
        assert dest.local_info == "info local"
