"""Tests de los nodos del grafo LangGraph."""

import pytest
from unittest.mock import patch, MagicMock
from langchain_core.messages import HumanMessage, AIMessage

from app.graph.state import NomadState, UserProfile, Destination, DestinationMedia, ClimateInfo, VisaInfo


class TestProfileNode:
    def test_skips_when_profile_complete(self, complete_state):
        from app.nodes.profile_node import profile_node
        complete_state.profile_complete = True
        result = profile_node(complete_state, {})
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
            result = profile_node(state, {})

        assert result["profile_complete"] is True
        assert result["user_profile"].nationality == "argentina"
        assert result["user_profile"].budget_usd_monthly == 2000

    def test_returns_message_when_profile_incomplete(self):
        from app.nodes.profile_node import profile_node

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="¿Cuál es tu presupuesto?")

        state = NomadState(messages=[HumanMessage(content="Hola")])

        with patch("app.nodes.profile_node.ChatGoogleGenerativeAI", return_value=mock_llm):
            result = profile_node(state, {})

        assert "messages" in result
        assert "profile_complete" not in result


class TestDestinationNode:
    def test_returns_destinations(self, complete_state):
        from app.nodes.destination_node import destination_node
        import json

        destinations_json = json.dumps([{
            "city": "Dublín",
            "country": "Irlanda",
            "match_score": 92,
            "match_reasons": ["Inglés nativo", "Comunidad expat activa"],
            "monthly_cost_usd": 1800,
        }])

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content=destinations_json)

        with patch("app.nodes.destination_node.ChatGoogleGenerativeAI", return_value=mock_llm):
            result = destination_node(complete_state, {})

        assert len(result["destinations"]) == 1
        assert result["destinations"][0].city == "Dublín"
        assert result["destinations"][0].match_score == 92

    def test_english_goal_adds_constraint_to_prompt(self, complete_state):
        from app.nodes.destination_node import _detect_language_goal

        assert _detect_language_goal(["learn english", "networking"]) is not None
        assert _detect_language_goal(["networking", "aventura"]) is None
        assert _detect_language_goal(["learn spanish"]) is not None
        assert _detect_language_goal(["learn french", "low cost"]) is not None

    def test_detect_language_goal_all_supported_languages(self):
        from app.nodes.destination_node import _detect_language_goal

        assert _detect_language_goal(["learn portuguese"]) is not None
        assert _detect_language_goal(["learn german"]) is not None
        assert _detect_language_goal(["learn italian"]) is not None
        assert _detect_language_goal(["learn japanese"]) is not None
        assert _detect_language_goal(["learn mandarin"]) is not None

    def test_detect_language_goal_no_match(self):
        from app.nodes.destination_node import _detect_language_goal

        assert _detect_language_goal([]) is None
        assert _detect_language_goal(["low cost", "safety", "nightlife"]) is None
        assert _detect_language_goal(["networking", "great weather"]) is None

    def test_english_constraint_in_prompt(self, complete_state):
        from app.nodes.destination_node import destination_node
        import json

        complete_state.user_profile.goals = ["inmersión en inglés", "networking"]

        captured_prompt = []
        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = lambda msgs, **kw: (
            captured_prompt.extend(msgs) or
            AIMessage(content=json.dumps([{
                "city": "Dublín", "country": "Irlanda",
                "match_score": 90, "match_reasons": ["inglés"], "monthly_cost_usd": 1800
            }]))
        )

        with patch("app.nodes.destination_node.ChatGoogleGenerativeAI", return_value=mock_llm):
            destination_node(complete_state, {})

        prompt_text = " ".join(m.content for m in captured_prompt)
        assert "EXCLUIDOS" in prompt_text
        assert "Colombia" in prompt_text

    def test_timezone_parse(self):
        from app.nodes.destination_node import _parse_utc_offset

        assert _parse_utc_offset("UTC-3") == -3.0
        assert _parse_utc_offset("UTC+5:30") == 5.5
        assert _parse_utc_offset("UTC+0") == 0.0
        assert _parse_utc_offset("UTC") == 0.0
        assert _parse_utc_offset("GMT+1") == 1.0
        assert _parse_utc_offset("America/Buenos_Aires") is None
        assert _parse_utc_offset(None) is None

    def test_timezone_constraint_in_prompt(self, complete_state):
        from app.nodes.destination_node import destination_node
        import json

        complete_state.user_profile.work_timezone = "UTC-3"

        captured_prompt = []
        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = lambda msgs, **kw: (
            captured_prompt.extend(msgs) or
            AIMessage(content=json.dumps([{
                "city": "Lisboa", "country": "Portugal",
                "match_score": 85, "match_reasons": ["UTC+1, 4h diferencia"], "monthly_cost_usd": 1800
            }]))
        )

        with patch("app.nodes.destination_node.ChatGoogleGenerativeAI", return_value=mock_llm):
            destination_node(complete_state, {})

        prompt_text = " ".join(m.content for m in captured_prompt)
        assert "ZONA HORARIA" in prompt_text
        assert "UTC-9" in prompt_text
        assert "UTC+3" in prompt_text

    def test_no_timezone_constraint_when_unset(self, complete_state):
        from app.nodes.destination_node import destination_node
        import json

        complete_state.user_profile.work_timezone = None

        captured_prompt = []
        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = lambda msgs, **kw: (
            captured_prompt.extend(msgs) or
            AIMessage(content=json.dumps([{
                "city": "Bangkok", "country": "Tailandia",
                "match_score": 80, "match_reasons": ["bajo costo"], "monthly_cost_usd": 1000
            }]))
        )

        with patch("app.nodes.destination_node.ChatGoogleGenerativeAI", return_value=mock_llm):
            destination_node(complete_state, {})

        prompt_text = " ".join(m.content for m in captured_prompt)
        assert "ZONA HORARIA OBLIGATORIA" not in prompt_text


class TestCompilerNode:
    def test_generates_final_report(self, complete_state):
        from app.nodes.compiler_node import compiler_node

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="# Tu reporte de nómada\n\nMedellín es perfecto para vos.")

        with patch("app.nodes.compiler_node.ChatGoogleGenerativeAI", return_value=mock_llm):
            result = compiler_node(complete_state, {})

        assert result["final_report"]
        assert "Medellín" in result["final_report"]

    def test_accommodation_links_always_appended(self, complete_state, sample_destination):
        from app.nodes.compiler_node import compiler_node
        from app.tools.accommodation_tool import get_accommodation_links

        sample_destination.accommodation_links = get_accommodation_links("Medellín", "Colombia")
        complete_state.destinations = [sample_destination]

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="Reporte sin links de alojamiento.")

        with patch("app.nodes.compiler_node.ChatGoogleGenerativeAI", return_value=mock_llm):
            result = compiler_node(complete_state, {})

        report = result["final_report"]
        assert "🏠 Dónde alojarte" in report
        assert "airbnb.com" in report
        assert "booking.com" in report

    def test_includes_local_info_when_present(self, complete_state, sample_destination):
        from app.nodes.compiler_node import _format_dest_for_prompt

        sample_destination.local_info = "HOBBIES: Futbol 5 El Estadio\nNETWORKING: Selina Medellín"
        formatted = _format_dest_for_prompt(sample_destination)

        assert "Futbol 5 El Estadio" in formatted
        assert "Selina Medellín" in formatted

    def test_result_data_includes_visa_required_field(self, complete_state, sample_destination):
        from app.nodes.compiler_node import _build_result_data

        sample_destination.visa.visa_required = False
        complete_state.destinations = [sample_destination]

        result = _build_result_data(complete_state, [])
        visa = result["destinations"][0]["visa"]

        assert "required" in visa
        assert visa["required"] is False

    def test_visa_required_true_in_result(self, complete_state, sample_destination):
        from app.nodes.compiler_node import _build_result_data

        sample_destination.visa.visa_required = True
        sample_destination.visa.visa_type = "Tourist Visa"
        sample_destination.visa.max_stay_days = 30
        complete_state.destinations = [sample_destination]

        result = _build_result_data(complete_state, [])
        visa = result["destinations"][0]["visa"]

        assert visa["required"] is True
        assert visa["type"] == "Tourist Visa"
        assert visa["max_stay_days"] == 30

    def test_visa_required_none_when_unknown(self, complete_state, sample_destination):
        from app.nodes.compiler_node import _build_result_data

        sample_destination.visa.visa_required = None
        complete_state.destinations = [sample_destination]

        result = _build_result_data(complete_state, [])
        visa = result["destinations"][0]["visa"]

        assert visa["required"] is None

    def test_visa_summary_not_required(self, sample_destination):
        from app.nodes.compiler_node import _visa_summary

        sample_destination.visa.visa_required = False
        assert _visa_summary(sample_destination) == "No visa required"

    def test_visa_summary_required_with_type_and_days(self, sample_destination):
        from app.nodes.compiler_node import _visa_summary

        sample_destination.visa.visa_required = True
        sample_destination.visa.visa_type = "Tourist Visa"
        sample_destination.visa.max_stay_days = 90
        assert _visa_summary(sample_destination) == "Tourist Visa 90d"

    def test_visa_summary_required_no_type(self, sample_destination):
        from app.nodes.compiler_node import _visa_summary

        sample_destination.visa.visa_required = True
        sample_destination.visa.visa_type = None
        sample_destination.visa.max_stay_days = None
        assert _visa_summary(sample_destination) == "Visa"

    def test_compiler_english_prompt(self, complete_state):
        from app.nodes.compiler_node import _system_prompt

        prompt_en = _system_prompt("en")
        prompt_es = _system_prompt("es")

        assert "ENGLISH" in prompt_en
        assert "ESPAÑOL" in prompt_es


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
            result = asyncio.run(enrichment_node(complete_state, {}))

        assert len(result["destinations"]) == 1
        dest = result["destinations"][0]
        assert dest.media.youtube_links == ["https://youtube.com/watch?v=abc"]
        assert dest.climate.best_months == ["Dic", "Ene"]
        assert dest.visa.visa_required is False
        assert dest.local_info == "info local"
        assert len(dest.accommodation_links) == 3
        platforms = [link["platform"] for link in dest.accommodation_links]
        assert "Airbnb" in platforms
        assert "Booking.com" in platforms


class TestAccommodationTool:
    def test_returns_three_platforms(self):
        from app.tools.accommodation_tool import get_accommodation_links
        links = get_accommodation_links("Medellín", "Colombia")
        assert len(links) == 3

    def test_urls_contain_city(self):
        from app.tools.accommodation_tool import get_accommodation_links
        links = get_accommodation_links("Medellín", "Colombia")
        for link in links:
            assert "Medell" in link["url"]
            assert link["url"].startswith("https://")

    def test_city_with_spaces_encoded(self):
        from app.tools.accommodation_tool import get_accommodation_links
        links = get_accommodation_links("Ciudad de México", "México")
        for link in links:
            assert " " not in link["url"]

    def test_airbnb_has_monthly_filter(self):
        from app.tools.accommodation_tool import get_accommodation_links
        links = get_accommodation_links("Lisboa", "Portugal")
        airbnb = next(l for l in links if l["platform"] == "Airbnb")
        assert "monthly_length=1" in airbnb["url"]

    def test_budget_applies_price_filter_to_airbnb(self):
        from app.tools.accommodation_tool import get_accommodation_links
        links = get_accommodation_links("Bangkok", "Tailandia", budget_usd_monthly=2000)
        airbnb = next(l for l in links if l["platform"] == "Airbnb")
        # 40% de 2000 = 800
        assert "price_max=800" in airbnb["url"]

    def test_budget_applies_price_filter_to_booking(self):
        from app.tools.accommodation_tool import get_accommodation_links
        links = get_accommodation_links("Bangkok", "Tailandia", budget_usd_monthly=2000)
        booking = next(l for l in links if l["platform"] == "Booking.com")
        # nightly = max(10, 800 // 30) = 26
        assert "26" in booking["url"]

    def test_no_budget_no_price_filter(self):
        from app.tools.accommodation_tool import get_accommodation_links
        links = get_accommodation_links("Bangkok", "Tailandia", budget_usd_monthly=None)
        airbnb = next(l for l in links if l["platform"] == "Airbnb")
        booking = next(l for l in links if l["platform"] == "Booking.com")
        assert "price_max" not in airbnb["url"]
        assert "price" not in booking["url"]

    def test_english_labels(self):
        from app.tools.accommodation_tool import get_accommodation_links
        links = get_accommodation_links("Lisbon", "Portugal", language="en")
        airbnb = next(l for l in links if l["platform"] == "Airbnb")
        booking = next(l for l in links if l["platform"] == "Booking.com")
        hostelworld = next(l for l in links if l["platform"] == "Hostelworld")
        assert "Monthly stays" in airbnb["label"]
        assert "Apartments" in booking["label"]
        assert "Accommodation" in hostelworld["label"]

    def test_spanish_labels_default(self):
        from app.tools.accommodation_tool import get_accommodation_links
        links = get_accommodation_links("Lisboa", "Portugal", language="es")
        airbnb = next(l for l in links if l["platform"] == "Airbnb")
        booking = next(l for l in links if l["platform"] == "Booking.com")
        hostelworld = next(l for l in links if l["platform"] == "Hostelworld")
        assert "Estadías mensuales" in airbnb["label"]
        assert "Apartamentos" in booking["label"]
        assert "Hospedajes" in hostelworld["label"]
