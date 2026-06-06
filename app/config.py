from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    google_api_key: str = ""
    google_model_id: str = "gemini-2.0-flash"
    tavily_api_key: str = ""
    youtube_api_key: str = ""
    google_client_id: str = ""
    sqs_queue_url: str = "https://sqs.us-east-1.amazonaws.com/237216011543/nomadai-chat-jobs"
    log_level: str = "INFO"
    # DynamoDB table names — override per environment (dev uses *-dev suffix)
    profiles_table: str = "nomadai-profiles"
    jobs_table: str = "nomadai-jobs"
    reports_table: str = "nomadai-reports"
    checkpoints_table: str = "nomadai-checkpoints"
    checkpoints_s3_bucket: str = "nomadai-checkpoints-offload"
    rate_limit_table: str = "nomadai-rate-limits"
    rate_limit_requests: int = 30  # max requests per user per hour
    langsmith_api_key: str = ""
    langsmith_project: str = "nomadai-dev"
    # Qdrant vector database
    qdrant_url: str = ""
    qdrant_api_key: str = ""
    qdrant_collection: str = "nomadai-knowledge"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
