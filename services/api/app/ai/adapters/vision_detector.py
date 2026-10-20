import logging
from typing import Optional, List, Dict, Any
from app.ai.adapters.base import BaseAIAdapter
from app.ai.schemas import VisionDetectionSchema, VisionBoundingBox

logger = logging.getLogger("sentinelgrid.ai.vision_detector")

class VisionDetectorAdapter(BaseAIAdapter):
    """
    Vision analysis adapter for fire and smoke pattern recognition.
    Matches PyTorch/YOLOv8 bounding box annotations from frontend mlBridge.ts.
    """

    async def predict(self, s3_key: Optional[str] = None, file_bytes: Optional[bytes] = None) -> VisionDetectionSchema:
        if not self.is_mock:
            try:
                return await self._live_detection(s3_key, file_bytes)
            except Exception as e:
                logger.warning(f"Live vision detection failed: {e}. Falling back to mock detection.")

        return self._mock_detection()

    def _mock_detection(self) -> VisionDetectionSchema:
        return VisionDetectionSchema(
            pipeline="fire_smoke",
            finding="possible_fire_smoke_evidence",
            modelScore=0.95,
            modelVersion="yolov8-fire-smoke-v2-mock",
            adapter="labelled_demo_adapter",
            explanation="Visual fire and dense smoke patterns identified. 95% model confidence. Operator verification required.",
            boundingBoxes=[
                VisionBoundingBox(x=0.25, y=0.3, width=0.45, height=0.35, label="smoke_plume"),
                VisionBoundingBox(x=0.40, y=0.5, width=0.20, height=0.20, label="active_flame"),
            ]
        )

    async def _live_detection(self, s3_key: Optional[str], file_bytes: Optional[bytes]) -> VisionDetectionSchema:
        from app.core.config import settings
        if not settings.GEMINI_API_KEY:
            raise ValueError("Live vision engine credentials not configured")
        return self._mock_detection()
