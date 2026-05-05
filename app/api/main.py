from dotenv import load_dotenv
load_dotenv()

import logging
import traceback
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from pydantic import BaseModel
from langchain_core.messages import HumanMessage
import asyncio
import uuid
import json
import boto3

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from app.graph import graph
from app.services.profile_store import get_profile, save_profile, delete_profile
from app.services.job_store import create_pending_job, get_job
from app.services.auth import get_current_user
from app.services.rate_limiter import rate_limit
from app.config import settings

_sqs = None

def _get_sqs():
    global _sqs
    if _sqs is None:
        _sqs = boto3.client("sqs", region_name="us-east-1")
    return _sqs

_google_request = google_requests.Request()

app = FastAPI(
    title="NomadAI API",
    description="Recomendador inteligente de destinos para nómadas digitales",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_static = Path(__file__).parent.parent / "static"
app.mount("/static", StaticFiles(directory=_static), name="static")
_assets_dir = _static / "assets"
if _assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")


@app.get("/")
def root():
    return FileResponse(_static / "index.html")


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


class ChatResponse(BaseModel):
    session_id: str
    user_id: str
    reply: str
    final_report: str | None = None
    profile_complete: bool = False


@app.get("/health")
def health():
    return {"status": "ok"}


class GoogleAuthRequest(BaseModel):
    credential: str


@app.post("/auth/google")
def auth_google(body: GoogleAuthRequest):
    try:
        info = id_token.verify_oauth2_token(
            body.credential,
            _google_request,
            settings.google_client_id,
        )
        return {
            "user_id": info["sub"],
            "email": info.get("email", ""),
            "name": info.get("name", ""),
            "picture": info.get("picture", ""),
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token inválido: {e}")


@app.get("/profile/{user_id}")
def get_user_profile(user_id: str, current_user: str = Depends(get_current_user)):
    if user_id != current_user:
        raise HTTPException(status_code=403, detail="No autorizado")
    profile = get_profile(user_id)
    if not profile:
        return {"found": False}
    return {"found": True, "profile": profile.model_dump()}


@app.delete("/profile/{user_id}")
def delete_user_profile(user_id: str, current_user: str = Depends(get_current_user)):
    if user_id != current_user:
        raise HTTPException(status_code=403, detail="No autorizado")
    delete_profile(user_id)
    return {"deleted": True}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, user_id: str = Depends(rate_limit)):
    session_id = request.session_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": session_id}}

    try:
        prev_state = await graph.aget_state(config)
        had_report = bool(
            prev_state.values.get("final_report")
            if prev_state and prev_state.values
            else False
        )

        is_new_thread = not (prev_state and prev_state.values)
        saved_profile = await asyncio.to_thread(get_profile, user_id) if is_new_thread else None

        initial_state: dict = {"messages": [HumanMessage(content=request.message)]}
        if saved_profile:
            initial_state["user_profile"] = saved_profile
            initial_state["profile_complete"] = True

        result = await graph.ainvoke(initial_state, config=config)

        last_message = result["messages"][-1]
        reply = last_message.content if hasattr(last_message, "content") else str(last_message)

        final_report = None if had_report else result.get("final_report")

        prev_profile_complete = prev_state.values.get("profile_complete") if prev_state and prev_state.values else False
        if result.get("profile_complete") and not prev_profile_complete:
            await asyncio.to_thread(save_profile, user_id, result["user_profile"])

        return ChatResponse(
            session_id=session_id,
            user_id=user_id,
            reply=reply,
            final_report=final_report,
            profile_complete=result.get("profile_complete", False),
        )
    except Exception as e:
        logger.error("Error en /chat:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat/async")
def chat_async(request: ChatRequest, user_id: str = Depends(rate_limit)):
    job_id = str(uuid.uuid4())
    session_id = request.session_id or str(uuid.uuid4())

    create_pending_job(job_id)

    _get_sqs().send_message(
        QueueUrl=settings.sqs_queue_url,
        MessageBody=json.dumps({
            "job_id": job_id,
            "session_id": session_id,
            "user_id": user_id,
            "message": request.message,
        }),
    )

    return {"job_id": job_id, "session_id": session_id, "user_id": user_id, "status": "pending"}


@app.get("/chat/status/{job_id}")
def chat_status(job_id: str):
    job = get_job(job_id)
    if not job:
        return {"status": "pending"}
    return job
