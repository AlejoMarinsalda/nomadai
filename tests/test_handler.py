"""Tests del handler Lambda — procesa eventos HTTP y SQS."""

import json
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from langchain_core.messages import AIMessage
from app.graph.state import UserProfile

# Las imports de app dentro de _process_sqs son locales (from app.xxx import xxx),
# así que se parchean en la ubicación de origen, no en handler.xxx


def _sqs_event(records):
    return {"Records": records}


def _sqs_record(message_id: str, job_id: str, **kwargs) -> dict:
    body = {"job_id": job_id, "session_id": "sess-1", "user_id": "user-1", "message": "Hola", **kwargs}
    return {
        "messageId": message_id,
        "eventSource": "aws:sqs",
        "body": json.dumps(body),
    }


def _mock_graph(reply: str = "Te recomiendo Medellín"):
    mock = MagicMock()
    mock.aget_state = AsyncMock(return_value=MagicMock(values={}))
    mock.ainvoke = AsyncMock(return_value={
        "messages": [AIMessage(content=reply)],
        "final_report": None,
        "profile_complete": False,
        "user_profile": UserProfile(),
    })
    return mock


PATCHES = dict(
    graph="app.graph.graph",
    save_job_result="app.services.job_store.save_job_result",
    get_profile="app.services.profile_store.get_profile",
    save_profile="app.services.profile_store.save_profile",
)


class TestSqsHandler:
    def test_successful_job_returns_empty_failures(self):
        """Un job exitoso no aparece en batchItemFailures."""
        from handler import _process_sqs

        mock_save = MagicMock()
        event = _sqs_event([_sqs_record("msg-1", "job-1")])

        with patch(PATCHES["graph"], _mock_graph()), \
             patch(PATCHES["save_job_result"], mock_save), \
             patch(PATCHES["get_profile"], return_value=None), \
             patch(PATCHES["save_profile"]):

            result = asyncio.run(_process_sqs(event))

        assert result == {"batchItemFailures": []}
        mock_save.assert_called_once()
        saved = mock_save.call_args[0][1]
        assert saved["status"] == "done"

    def test_failed_job_reported_as_batch_item_failure(self):
        """Un job que lanza excepción aparece en batchItemFailures para que SQS reintente."""
        from handler import _process_sqs

        mock_graph = _mock_graph()
        mock_graph.ainvoke = AsyncMock(side_effect=Exception("LLM timeout"))

        mock_save = MagicMock()
        event = _sqs_event([_sqs_record("msg-2", "job-2")])

        with patch(PATCHES["graph"], mock_graph), \
             patch(PATCHES["save_job_result"], mock_save), \
             patch(PATCHES["get_profile"], return_value=None):

            result = asyncio.run(_process_sqs(event))

        assert result == {"batchItemFailures": [{"itemIdentifier": "msg-2"}]}
        mock_save.assert_called_once()
        saved = mock_save.call_args[0][1]
        assert saved["status"] == "error"

    def test_partial_batch_failure(self):
        """Con dos mensajes, uno exitoso y uno fallido, solo el fallido va en batchItemFailures."""
        from handler import _process_sqs

        call_count = 0

        async def ainvoke_side_effect(state, config):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise Exception("fallo el segundo")
            return {
                "messages": [AIMessage(content="ok")],
                "final_report": None,
                "profile_complete": False,
                "user_profile": UserProfile(),
            }

        mock_graph = MagicMock()
        mock_graph.aget_state = AsyncMock(return_value=MagicMock(values={}))
        mock_graph.ainvoke = ainvoke_side_effect

        mock_save = MagicMock()
        event = _sqs_event([
            _sqs_record("msg-ok", "job-ok"),
            _sqs_record("msg-fail", "job-fail"),
        ])

        with patch(PATCHES["graph"], mock_graph), \
             patch(PATCHES["save_job_result"], mock_save), \
             patch(PATCHES["get_profile"], return_value=None):

            result = asyncio.run(_process_sqs(event))

        assert result == {"batchItemFailures": [{"itemIdentifier": "msg-fail"}]}
        assert mock_save.call_count == 2
