from dotenv import load_dotenv
load_dotenv()

import asyncio
import json
import logging
import os
import traceback

from app.config import settings

# Ensure LangChain tracing env vars are set before any LangChain import.
# setdefault: respects vars already in os.environ (Lambda config) — never overrides them.
if settings.langsmith_api_key:
    os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
    os.environ.setdefault("LANGCHAIN_API_KEY", settings.langsmith_api_key)
    os.environ.setdefault("LANGCHAIN_PROJECT", settings.langsmith_project)

from app.api.main import app
from mangum import Mangum

logger = logging.getLogger(__name__)

_http_handler = Mangum(app, lifespan="off")

# Build a module-level LangSmith tracer once per cold start.
# Using explicit callbacks is more reliable than env vars alone in Lambda
# because env vars must be set before LangChain initializes its tracing state.
_tracer = None
if settings.langsmith_api_key:
    try:
        from langsmith import Client as LangSmithClient
        from langchain_core.tracers.langchain import LangChainTracer
        _tracer = LangChainTracer(
            project_name=settings.langsmith_project,
            client=LangSmithClient(api_key=settings.langsmith_api_key),
        )
        logger.info("LangSmith tracer initialized → project: %s", settings.langsmith_project)
    except Exception as e:
        logger.warning("LangSmith tracer could not be initialized: %s", e)


def _flush_langsmith():
    try:
        from langsmith import Client
        Client(api_key=settings.langsmith_api_key).flush()
    except Exception:
        pass


def handler(event, context):
    records = event.get("Records", [])
    if records and records[0].get("eventSource") == "aws:sqs":
        result = asyncio.run(_process_sqs(event))
        asyncio.set_event_loop(asyncio.new_event_loop())
        return result
    return _http_handler(event, context)


async def _process_sqs(event):
    from langchain_core.messages import HumanMessage
    from app.graph import graph
    from app.services.profile_store import get_profile, save_profile
    from app.services.job_store import save_job_result
    from app.services.report_store import save_report

    batch_item_failures = []

    for record in event["Records"]:
        body = json.loads(record["body"])
        job_id = body["job_id"]
        message_id = record["messageId"]

        try:
            session_id = body["session_id"]
            user_id = body["user_id"]
            message = body["message"]
            language = body.get("language", "es")

            config = {"configurable": {"thread_id": session_id}}
            if _tracer:
                config["callbacks"] = [_tracer]

            prev_state = await graph.aget_state(config)
            had_report = bool(
                prev_state.values.get("final_report")
                if prev_state and prev_state.values
                else False
            )

            is_new_thread = not (prev_state and prev_state.values)
            saved_profile = await asyncio.to_thread(get_profile, user_id) if is_new_thread else None

            initial_state = {"messages": [HumanMessage(content=message)], "language": language}
            if saved_profile:
                initial_state["user_profile"] = saved_profile
                initial_state["profile_complete"] = True

            result = await graph.ainvoke(initial_state, config=config)

            last_message = result["messages"][-1]
            reply = last_message.content if hasattr(last_message, "content") else str(last_message)
            final_report = None if had_report else result.get("final_report")

            prev_complete = prev_state.values.get("profile_complete") if prev_state and prev_state.values else False
            if result.get("profile_complete") and not prev_complete:
                await asyncio.to_thread(save_profile, user_id, result["user_profile"])

            result_data = None if had_report else result.get("result_data")

            if final_report and not user_id.startswith("guest_"):
                await asyncio.to_thread(
                    save_report, user_id, final_report,
                    result.get("destinations", []), session_id, result_data
                )

            await asyncio.to_thread(save_job_result, job_id, {
                "status": "done",
                "session_id": session_id,
                "user_id": user_id,
                "reply": reply,
                "final_report": final_report,
                "result_data": result_data,
                "profile_complete": result.get("profile_complete", False),
            })

        except Exception:
            logger.error("Error procesando job %s:\n%s", job_id, traceback.format_exc())
            await asyncio.to_thread(
                save_job_result, job_id,
                {"status": "error", "error": "Error interno procesando la solicitud."},
            )
            batch_item_failures.append({"itemIdentifier": message_id})

    _flush_langsmith()
    return {"batchItemFailures": batch_item_failures}
