import time
import logging
import boto3
from fastapi import HTTPException, Depends

from app.services.auth import get_current_user
from app.config import settings

logger = logging.getLogger(__name__)

_db = None


def _get_db():
    global _db
    if _db is None:
        _db = boto3.client("dynamodb", region_name="us-east-1")
    return _db


def _current_window() -> str:
    """UTC hour bucket used as rate-limit window, e.g. '2026-04-29T14'."""
    return time.strftime("%Y-%m-%dT%H", time.gmtime())


def _window_ttl() -> int:
    """Unix timestamp for end of current hour + 60s buffer."""
    now = int(time.time())
    return (now // 3600 + 1) * 3600 + 60


def is_allowed(user_id: str) -> bool:
    """
    Atomically increments the request counter for user_id in the current hour
    window. Returns False if the user has exceeded the configured limit.
    Fails open (returns True) on DynamoDB errors so an outage doesn't lock
    out legitimate users.
    """
    try:
        resp = _get_db().update_item(
            TableName=settings.rate_limit_table,
            Key={
                "user_id": {"S": user_id},
                "window": {"S": _current_window()},
            },
            UpdateExpression=(
                "ADD #c :one "
                "SET expires_at = if_not_exists(expires_at, :ttl)"
            ),
            ExpressionAttributeNames={"#c": "count"},
            ExpressionAttributeValues={
                ":one": {"N": "1"},
                ":ttl": {"N": str(_window_ttl())},
            },
            ReturnValues="UPDATED_NEW",
        )
        count = int(resp["Attributes"]["count"]["N"])
        return count <= settings.rate_limit_requests
    except Exception:
        logger.exception("Rate limiter DynamoDB error — failing open for user %s", user_id)
        return True


def rate_limit(user_id: str = Depends(get_current_user)) -> str:
    """FastAPI dependency: validates token AND enforces per-hour rate limit."""
    if not is_allowed(user_id):
        raise HTTPException(
            status_code=429,
            detail=(
                f"Límite de {settings.rate_limit_requests} requests por hora alcanzado. "
                "Intentá de nuevo en la próxima hora."
            ),
        )
    return user_id
