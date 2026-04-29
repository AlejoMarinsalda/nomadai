"""Tests de los endpoints FastAPI."""

import json
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from langchain_core.messages import AIMessage
from app.graph.state import UserProfile

TEST_USER = "test-user-1"


def test_health(api_client):
    client, _, _ = api_client
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_root_serves_html(api_client):
    client, _, _ = api_client
    res = client.get("/")
    assert res.status_code == 200
    assert "text/html" in res.headers["content-type"]


class TestChatAsync:
    def test_returns_job_id(self, api_client):
        client, _, mock_db = api_client
        res = client.post("/chat/async", json={
            "message": "Quiero viajar como nómada",
            "session_id": "sess-1",
        })
        assert res.status_code == 200
        data = res.json()
        assert "job_id" in data
        assert data["status"] == "pending"
        assert data["session_id"] == "sess-1"
        assert data["user_id"] == TEST_USER

    def test_generates_ids_when_missing(self, api_client):
        client, _, _ = api_client
        res = client.post("/chat/async", json={"message": "Hola"})
        assert res.status_code == 200
        data = res.json()
        assert data["session_id"]
        assert data["user_id"] == TEST_USER

    def test_creates_pending_job_in_dynamo(self, api_client):
        client, _, mock_db = api_client
        client.post("/chat/async", json={"message": "test"})
        mock_db.put_item.assert_called()


class TestChatStatus:
    def test_pending_when_job_not_found(self, api_client):
        client, _, mock_db = api_client
        mock_db.get_item.return_value = {"Item": None}
        res = client.get("/chat/status/job-inexistente")
        assert res.status_code == 200
        assert res.json()["status"] == "pending"

    def test_returns_result_when_done(self, api_client):
        client, _, mock_db = api_client
        result = {"status": "done", "reply": "Tu destino es Medellín"}
        mock_db.get_item.return_value = {
            "Item": {"job_id": {"S": "job-1"}, "result_json": {"S": json.dumps(result)}}
        }
        res = client.get("/chat/status/job-1")
        assert res.status_code == 200
        assert res.json()["status"] == "done"
        assert "Medellín" in res.json()["reply"]


class TestChat:
    def test_returns_reply(self, api_client):
        client, mock_graph, _ = api_client
        mock_graph.ainvoke = AsyncMock(return_value={
            "messages": [AIMessage(content="Te recomiendo Medellín")],
            "final_report": None,
            "profile_complete": False,
            "user_profile": UserProfile(),
        })
        res = client.post("/chat", json={
            "message": "Hola",
            "session_id": "sess-2",
        })
        assert res.status_code == 200
        assert res.json()["reply"] == "Te recomiendo Medellín"

    def test_saves_profile_when_complete(self, api_client):
        client, mock_graph, mock_db = api_client
        profile = UserProfile(
            hobbies=["fútbol"], budget_usd_monthly=2000,
            work_timezone="UTC-3", nationality="argentina",
            goals=["networking"], preferred_climate="templado",
        )
        mock_graph.aget_state = AsyncMock(return_value=MagicMock(values={}))
        mock_graph.ainvoke = AsyncMock(return_value={
            "messages": [AIMessage(content="Perfil completo")],
            "final_report": None,
            "profile_complete": True,
            "user_profile": profile,
        })
        res = client.post("/chat", json={"message": "Mi perfil"})
        assert res.status_code == 200
        assert res.json()["profile_complete"] is True
        mock_db.put_item.assert_called()


class TestProfile:
    def test_get_profile_not_found(self, api_client):
        client, _, mock_db = api_client
        mock_db.get_item.return_value = {"Item": None}
        res = client.get(f"/profile/{TEST_USER}")
        assert res.status_code == 200
        assert res.json()["found"] is False

    def test_get_profile_found(self, api_client):
        client, _, mock_db = api_client
        stored = {
            "user_id": {"S": TEST_USER},
            "profile_json": {"S": json.dumps({
                "hobbies": ["fútbol"], "budget_usd_monthly": 2000,
                "work_timezone": "UTC-3", "nationality": "argentina",
                "goals": ["networking"], "preferred_climate": "templado",
                "remote_work": True,
            })},
        }
        mock_db.get_item.return_value = {"Item": stored}
        res = client.get(f"/profile/{TEST_USER}")
        assert res.status_code == 200
        assert res.json()["found"] is True

    def test_delete_profile(self, api_client):
        client, _, mock_db = api_client
        res = client.delete(f"/profile/{TEST_USER}")
        assert res.status_code == 200
        assert res.json()["deleted"] is True
        mock_db.delete_item.assert_called()

    def test_get_profile_forbidden_for_other_user(self, api_client):
        client, _, _ = api_client
        res = client.get("/profile/another-user")
        assert res.status_code == 403

    def test_delete_profile_forbidden_for_other_user(self, api_client):
        client, _, _ = api_client
        res = client.delete("/profile/another-user")
        assert res.status_code == 403
