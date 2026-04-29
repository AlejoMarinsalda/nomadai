"""Tests de la capa de servicios (job_store, profile_store, rag_store)."""

import json
import pytest
from unittest.mock import MagicMock, patch

from app.graph.state import UserProfile


class TestJobStore:
    def test_create_pending_job(self):
        from app.services.job_store import create_pending_job

        mock_db = MagicMock()
        with patch("app.services.job_store._db", return_value=mock_db):
            create_pending_job("job-123")

        mock_db.put_item.assert_called_once()
        call_args = mock_db.put_item.call_args[1]
        item = call_args["Item"]
        assert item["job_id"]["S"] == "job-123"
        assert json.loads(item["result_json"]["S"])["status"] == "pending"

    def test_save_job_result(self):
        from app.services.job_store import save_job_result

        mock_db = MagicMock()
        with patch("app.services.job_store._db", return_value=mock_db):
            save_job_result("job-123", {"status": "done", "reply": "Medellín"})

        mock_db.put_item.assert_called_once()
        item = mock_db.put_item.call_args[1]["Item"]
        result = json.loads(item["result_json"]["S"])
        assert result["status"] == "done"
        assert result["reply"] == "Medellín"

    def test_get_job_returns_none_when_not_found(self):
        from app.services.job_store import get_job

        mock_db = MagicMock()
        mock_db.get_item.return_value = {"Item": None}
        with patch("app.services.job_store._db", return_value=mock_db):
            result = get_job("job-inexistente")

        assert result is None

    def test_get_job_returns_result(self):
        from app.services.job_store import get_job

        stored = {"status": "done", "reply": "Tu destino es Medellín"}
        mock_db = MagicMock()
        mock_db.get_item.return_value = {
            "Item": {
                "job_id": {"S": "job-1"},
                "result_json": {"S": json.dumps(stored)},
            }
        }
        with patch("app.services.job_store._db", return_value=mock_db):
            result = get_job("job-1")

        assert result["status"] == "done"
        assert result["reply"] == "Tu destino es Medellín"

    def test_get_job_returns_none_on_error(self):
        from app.services.job_store import get_job

        mock_db = MagicMock()
        mock_db.get_item.side_effect = Exception("DynamoDB timeout")
        with patch("app.services.job_store._db", return_value=mock_db):
            result = get_job("job-error")

        assert result is None


class TestProfileStore:
    def _stored_profile(self, profile: UserProfile) -> dict:
        return {
            "user_id": {"S": "user-1"},
            "profile_json": {"S": json.dumps(profile.model_dump())},
        }

    def test_save_and_get_profile(self, sample_profile):
        from app.services.profile_store import save_profile, get_profile

        mock_db = MagicMock()
        mock_db.get_item.return_value = {"Item": self._stored_profile(sample_profile)}

        with patch("app.services.profile_store._db", return_value=mock_db):
            save_profile("user-1", sample_profile)
            result = get_profile("user-1")

        mock_db.put_item.assert_called_once()
        assert result.nationality == "argentina"
        assert result.budget_usd_monthly == 2000

    def test_get_profile_returns_none_when_missing(self):
        from app.services.profile_store import get_profile

        mock_db = MagicMock()
        mock_db.get_item.return_value = {"Item": None}

        with patch("app.services.profile_store._db", return_value=mock_db):
            result = get_profile("user-inexistente")

        assert result is None

    def test_delete_profile(self):
        from app.services.profile_store import delete_profile

        mock_db = MagicMock()
        with patch("app.services.profile_store._db", return_value=mock_db):
            delete_profile("user-1")

        mock_db.delete_item.assert_called_once_with(
            TableName="nomadai-profiles",
            Key={"user_id": {"S": "user-1"}},
        )


class TestRagStore:
    def test_search_returns_empty_when_unavailable(self):
        from app.services.rag_store import search_rag

        with patch("app.services.rag_store._load", return_value=None):
            result = search_rag("clima medellín")

        assert result == []

    def test_search_returns_results(self):
        from app.services.rag_store import search_rag
        from langchain_core.documents import Document

        mock_vs = MagicMock()
        mock_vs.similarity_search.return_value = [
            Document(page_content="Medellín tiene clima primaveral todo el año."),
            Document(page_content="Mejor época: diciembre y enero."),
        ]

        with patch("app.services.rag_store._load", return_value=mock_vs):
            result = search_rag("clima medellín", k=2)

        assert len(result) == 2
        assert "primaveral" in result[0]

    def test_search_returns_empty_on_error(self):
        from app.services.rag_store import search_rag

        mock_vs = MagicMock()
        mock_vs.similarity_search.side_effect = Exception("FAISS error")

        with patch("app.services.rag_store._load", return_value=mock_vs):
            result = search_rag("query")

        assert result == []
