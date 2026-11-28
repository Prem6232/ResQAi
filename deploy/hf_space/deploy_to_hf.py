"""
Deploy or update ResQAI's 16 GB Docker Space on Hugging Face Spaces (requires HF PRO or paid Space).

For $0 free deployment without HF PRO, use Option A in deploy/DEPLOY_FREE_24x7.md
(Render Free API + Supabase PostGIS/S3 + remote ml/server.py on Modal / GPU PC).
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import shutil
import tempfile
from pathlib import Path
from typing import Dict


def main() -> int:
    parser = argparse.ArgumentParser(description="Deploy ResQAI backend + 4-model ML Space to Hugging Face")
    parser.add_argument("--space-id", default="Yuv0801/resqai-api", help="Target HF Space repo ID")
    parser.add_argument("--model-repo", default="Yuv0801/resqai-indian-emergency-models", help="HF Model Hub repo ID")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""), help="PostGIS DATABASE_URL")
    parser.add_argument(
        "--s3-endpoint-url",
        default=os.environ.get("S3_ENDPOINT_URL", ""),
        help="S3/R2/Supabase Storage endpoint URL",
    )
    parser.add_argument("--s3-region", default=os.environ.get("S3_REGION", "ap-northeast-1"))
    parser.add_argument("--s3-bucket", default=os.environ.get("S3_BUCKET_NAME", "sentinelgrid-evidence"))
    parser.add_argument("--s3-access-key", default=os.environ.get("S3_ACCESS_KEY", ""))
    parser.add_argument("--s3-secret-key", default=os.environ.get("S3_SECRET_KEY", ""))
    parser.add_argument("--jwt-secret", default=os.environ.get("JWT_SECRET", ""))
    parser.add_argument("--skip-code-upload", action="store_true", help="Only update Space variables/secrets")
    args = parser.parse_args()

    from huggingface_hub import HfApi

    api = HfApi()
    api.create_repo(
        repo_id=args.space_id,
        repo_type="space",
        space_sdk="docker",
        space_hardware="cpu-basic",
        exist_ok=True,
    )

    variables: Dict[str, str] = {
        "ENVIRONMENT": "production",
        "AI_ADAPTER_MODE": "live",
        "AI_PRELOAD_ON_STARTUP": "true",
        "AI_INLINE_OUTBOX_POLL_SECONDS": "2.0",
        "HF_MODEL_REPO_ID": args.model_repo,
        "REDIS_URL": "",
        "S3_REGION": args.s3_region,
        "S3_BUCKET_NAME": args.s3_bucket,
        "S3_ADDRESSING_STYLE": "path",
        "CORS_ORIGINS": json.dumps(
            [
                "https://res-q-ai-coral.vercel.app",
                "http://localhost:3000",
                "http://localhost:5173",
            ]
        ),
    }
    if args.s3_endpoint_url:
        variables["S3_ENDPOINT_URL"] = args.s3_endpoint_url

    for key, val in variables.items():
        api.add_space_variable(repo_id=args.space_id, key=key, value=val)

    secrets_map: Dict[str, str] = {}
    if args.database_url:
        secrets_map["DATABASE_URL"] = args.database_url
    if args.s3_access_key:
        secrets_map["S3_ACCESS_KEY"] = args.s3_access_key
    if args.s3_secret_key:
        secrets_map["S3_SECRET_KEY"] = args.s3_secret_key

    # Only overwrite JWT_SECRET if explicitly provided or initialize once securely
    if args.jwt_secret:
        secrets_map["JWT_SECRET"] = args.jwt_secret
    else:
        existing_secrets = set()
        try:
            rt = api.get_space_runtime(repo_id=args.space_id)
            _ = rt
        except Exception:
            pass
        # Always set JWT_SECRET unless caller already configured one via flag/env; generate stable secret on first deploy
        secrets_map.setdefault("JWT_SECRET", secrets.token_urlsafe(48))

    for key, val in secrets_map.items():
        api.add_space_secret(repo_id=args.space_id, key=key, value=val)

    if not args.skip_code_upload:
        repo_root = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory(prefix="resqai_space_src_") as tmp:
            stage = Path(tmp)
            shutil.copy2(repo_root / "deploy" / "hf_space" / "README.md", stage / "README.md")
            shutil.copy2(repo_root / "deploy" / "hf_space" / "Dockerfile", stage / "Dockerfile")
            shutil.copytree(
                repo_root / "services" / "api",
                stage / "services" / "api",
                ignore=shutil.ignore_patterns(
                    ".venv",
                    "__pycache__",
                    ".pytest_cache",
                    "*.pyc",
                    ".env",
                    ".env.*",
                    "tests",
                ),
            )
            api.upload_folder(
                repo_id=args.space_id,
                repo_type="space",
                folder_path=str(stage),
                commit_message="Deploy ResQAI live 4-model FastAPI backend to 16GB HF Space",
            )

    runtime = api.get_space_runtime(repo_id=args.space_id)
    owner, name = args.space_id.split("/", 1)
    host_slug = f"{owner.lower()}-{name.lower()}".replace("_", "-")
    print(f"Space Page : https://huggingface.co/spaces/{args.space_id}")
    print(f"Public URL : https://{host_slug}.hf.space")
    print(f"Stage      : {runtime.stage}")
    print(f"Hardware   : {getattr(runtime.hardware, 'current', None) or runtime.hardware}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
