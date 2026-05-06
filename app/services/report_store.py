import json
import logging
import time
from datetime import datetime, timezone
import boto3
from app.config import settings

logger = logging.getLogger(__name__)
_client = None


def _db():
    global _client
    if _client is None:
        _client = boto3.client("dynamodb", region_name="us-east-1")
    return _client


def save_report(user_id: str, report_text: str, destinations: list, session_id: str = "") -> None:
    try:
        now = datetime.now(timezone.utc)
        cities = [{"city": d.city, "country": d.country} for d in destinations]
        _db().put_item(
            TableName=settings.reports_table,
            Item={
                "user_id":      {"S": user_id},
                "created_at":   {"S": now.isoformat()},
                "report_text":  {"S": report_text},
                "destinations": {"S": json.dumps(cities)},
                "session_id":   {"S": session_id},
                "ttl":          {"N": str(int(time.time()) + 86400 * 90)},
            },
        )
    except Exception as e:
        logger.warning("save_report failed for %s: %s", user_id, e)


def delete_report(user_id: str, created_at: str) -> None:
    try:
        _db().delete_item(
            TableName=settings.reports_table,
            Key={
                "user_id":    {"S": user_id},
                "created_at": {"S": created_at},
            },
        )
    except Exception as e:
        logger.warning("delete_report failed for %s: %s", user_id, e)


def get_latest_report(user_id: str) -> dict | None:
    results = get_reports(user_id)
    return results[0] if results else None


def get_reports(user_id: str) -> list[dict]:
    try:
        resp = _db().query(
            TableName=settings.reports_table,
            KeyConditionExpression="user_id = :uid",
            ExpressionAttributeValues={":uid": {"S": user_id}},
            ScanIndexForward=False,  # más reciente primero
            Limit=20,
        )
        items = resp.get("Items", [])
        return [
            {
                "created_at":   item["created_at"]["S"],
                "report_text":  item["report_text"]["S"],
                "destinations": json.loads(item["destinations"]["S"]),
                "session_id":   item.get("session_id", {}).get("S", ""),
            }
            for item in items
        ]
    except Exception as e:
        logger.warning("get_reports failed for %s: %s", user_id, e)
        return []
