import logging
import boto3
from datetime import datetime, timezone
from app.graph.state import UserProfile

logger = logging.getLogger(__name__)

_TABLE = "nomadai-profiles"
_client = None


def _db():
    global _client
    if _client is None:
        _client = boto3.client("dynamodb", region_name="us-east-1")
    return _client


def get_profile(user_id: str) -> UserProfile | None:
    try:
        item = _db().get_item(
            TableName=_TABLE,
            Key={"user_id": {"S": user_id}},
        ).get("Item")
        if not item:
            return None
        return UserProfile.model_validate_json(item["profile_json"]["S"])
    except Exception as e:
        logger.warning("get_profile failed for %s: %s", user_id, e)
        return None


def save_profile(user_id: str, profile: UserProfile) -> None:
    try:
        _db().put_item(
            TableName=_TABLE,
            Item={
                "user_id": {"S": user_id},
                "profile_json": {"S": profile.model_dump_json()},
                "updated_at": {"S": datetime.now(timezone.utc).isoformat()},
            },
        )
    except Exception as e:
        logger.warning("save_profile failed for %s: %s", user_id, e)


def delete_profile(user_id: str) -> None:
    try:
        _db().delete_item(
            TableName=_TABLE,
            Key={"user_id": {"S": user_id}},
        )
    except Exception as e:
        logger.warning("delete_profile failed for %s: %s", user_id, e)
