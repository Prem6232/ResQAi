from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List, Any, Union
import json

class Settings(BaseSettings):
    PROJECT_NAME: str = "SENTINELGRID"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"
    
    # PostgreSQL + PostGIS (asyncpg)
    DATABASE_URL: str = "postgresql+asyncpg://sentinel_user:sentinel_password_dev_123@localhost:5432/sentinelgrid_db"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # MinIO / S3 / R2 / Supabase Storage
    S3_ENDPOINT_URL: str = "http://localhost:9000"
    S3_PUBLIC_ENDPOINT_URL: str = ""
    S3_REGION: str = "us-east-1"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadminpassword123"
    S3_BUCKET_NAME: str = "sentinelgrid-evidence"

    # Geospatial / Routing
    OSRM_BASE_URL: str = "https://router.project-osrm.org"

    # Security / JWT
    JWT_SECRET: str = "dev_jwt_secret_sentinelgrid_supersecure_32chars_min"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 # 24 hours for dev/drill
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # CORS
    CORS_ORIGINS: Union[List[str], str] = [
        "https://res-q-ai-coral.vercel.app",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]
    
    # Celery & Worker
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    
    # AI Pipeline & Adapters
    AI_ADAPTER_MODE: str = "live" # "live" or "mock"
    AI_PRELOAD_ON_STARTUP: bool = False
    AI_INLINE_OUTBOX_POLL_SECONDS: float = 0.0
    TEXT_CLASSIFIER_MODEL_DIR: str = ""
    TEXT_CLASSIFIER_ONNX_FILE: str = "model_fp32.onnx"
    VOICE_TRANSCRIBER_MODEL_DIR: str = ""
    VOICE_TRANSCRIBER_DEVICE: str = "cpu"
    VOICE_TRANSCRIBER_COMPUTE_TYPE: str = "int8"
    DUPLICATE_MATCHER_MODEL_DIR: str = ""
    DUPLICATE_MATCHER_ONNX_FILE: str = "model_int8.onnx"
    VISION_DETECTOR_MODEL_DIR: str = ""
    VISION_DETECTOR_ONNX_FILE: str = "model_fp32.onnx"
    GEMINI_API_KEY: str = ""
    VISION_INFERENCE_URL: str = ""

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_db_connection(cls, v: Any) -> Any:
        if isinstance(v, str):
            if v.startswith("postgres://"):
                return v.replace("postgres://", "postgresql+asyncpg://", 1)
            elif v.startswith("postgresql://") and not v.startswith("postgresql+asyncpg://"):
                return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    @field_validator("CORS_ORIGINS", mode="after")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> List[str]:
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                try:
                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        return parsed
                except Exception:
                    pass
            return [x.strip() for x in v.split(",") if x.strip()]
        return ["*"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

settings = Settings()
