import logging
from typing import Any, Dict
from app.core.config import settings

logger = logging.getLogger("sentinelgrid.ai.adapter")

class BaseAIAdapter:
    def __init__(self, mode: str = None):
        self.mode = mode or settings.AI_ADAPTER_MODE
        self.is_mock = (self.mode == "mock")

    async def predict(self, *args, **kwargs) -> Any:
        raise NotImplementedError("Adapters must implement predict()")
