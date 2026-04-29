import json
import logging
import time
import boto3

logger = logging.getLogger(__name__)
_TABLE = "nomadai-jobs"
_client = None


def _db():
    global _client
    if _client is None:
        _client = boto3.client("dynamodb", region_name="us-east-1")
    return _client


def create_pending_job(job_id: str) -> None:
    try:
        _db().put_item(
            TableName=_TABLE,
            Item={
                "job_id": {"S": job_id},
                "result_json": {"S": json.dumps({"status": "pending"})},
                "ttl": {"N": str(int(time.time()) + 86400)},
            },
        )
    except Exception as e:
        logger.warning("create_pending_job failed for %s: %s", job_id, e)


def save_job_result(job_id: str, result: dict) -> None:
    try:
        _db().put_item(
            TableName=_TABLE,
            Item={
                "job_id": {"S": job_id},
                "result_json": {"S": json.dumps(result)},
                "ttl": {"N": str(int(time.time()) + 86400)},
            },
        )
    except Exception as e:
        logger.warning("save_job_result failed for %s: %s", job_id, e)


def get_job(job_id: str) -> dict | None:
    try:
        item = _db().get_item(
            TableName=_TABLE,
            Key={"job_id": {"S": job_id}},
        ).get("Item")
        if not item:
            return None
        return json.loads(item["result_json"]["S"])
    except Exception as e:
        logger.warning("get_job failed for %s: %s", job_id, e)
        return None
