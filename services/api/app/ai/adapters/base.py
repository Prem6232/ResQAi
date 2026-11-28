import logging
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger("sentinelgrid.ai.adapter")


class BaseAIAdapter:
    """Base adapter resolving live vs mock mode dynamically from settings unless overridden."""

    def __init__(self, mode: Optional[str] = None):
        self._explicit_mode = mode

    @property
    def mode(self) -> str:
        return self._explicit_mode or settings.AI_ADAPTER_MODE

    @property
    def is_mock(self) -> bool:
        return self.mode == "mock"

    async def predict(self, *args, **kwargs) -> Any:
        raise NotImplementedError("Adapters must implement predict()")
