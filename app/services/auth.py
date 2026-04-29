from fastapi import Header, HTTPException
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from app.config import settings

_google_request = google_requests.Request()


def get_current_user(authorization: str = Header(default=None)) -> str:
    """
    FastAPI dependency que valida el Google ID token en cada request.
    Retorna el user_id (Google 'sub') si el token es válido.
    Lanza 401 si falta el header o el token expiró/es inválido.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header requerido")

    token = authorization.removeprefix("Bearer ")

    try:
        info = id_token.verify_oauth2_token(
            token,
            _google_request,
            settings.google_client_id,
        )
        return info["sub"]
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token inválido o expirado: {e}")
