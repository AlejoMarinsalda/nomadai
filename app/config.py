from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    google_api_key: str = ""
    google_model_id: str = "gemini-2.0-flash"
    tavily_api_key: str = ""
    youtube_api_key: str = ""
    google_client_id: str = ""
    sqs_queue_url: str = "https://sqs.us-east-1.amazonaws.com/237216011543/nomadai-chat-jobs"
    log_level: str = "INFO"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
