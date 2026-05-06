import re
from fastapi import Header, HTTPException
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from app.config import settings

_google_request = google_requests.Request()

_GUEST_RE = re.compile(
    r'^guest_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)


def get_current_user(authorization: str = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header requerido")

    token = authorization.removeprefix("Bearer ")

    if _GUEST_RE.match(token):
        return token  # user_id == credential para invitados

    try:
        info = id_token.verify_oauth2_token(
            token,
            _google_request,
            settings.google_client_id,
        )
        return info["sub"]
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token inválido o expirado: {e}")
