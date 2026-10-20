import logging
from typing import Optional, Dict, Any
from app.ai.adapters.base import BaseAIAdapter
from app.ai.schemas import TextAssessmentSchema

logger = logging.getLogger("sentinelgrid.ai.text_classifier")

class TextClassifierAdapter(BaseAIAdapter):
    """
    Text classification adapter for categorizing emergency text and determining urgency.
    Matches frontend mlBridge.ts expectations in mock mode, with extensible live model switch.
    """

    async def predict(self, text: Optional[str]) -> TextAssessmentSchema:
        if not text or not text.strip():
            return TextAssessmentSchema(
                suggestedCategory="other",
                suggestedUrgency="medium",
                modelScore=0.50,
                scoreMeaning="Relative classifier score, not probability the incident is real.",
                reviewRequired=True,
                explanation="No text description provided. Human operator review strongly advised.",
                modelVersion="distilbert-emergency-v1-mock" if self.is_mock else "distilbert-emergency-v1-live",
            )

        if not self.is_mock:
            try:
                # Live model inference stub / hook
                return await self._live_inference(text)
            except Exception as e:
                logger.warning(f"Live model inference failed: {e}. Falling back to rule-based mock engine.")

        return self._mock_inference(text)

    def _mock_inference(self, text: str) -> TextAssessmentSchema:
        lower = text.lower()

        # 1. Fire / Smoke
        if any(kw in lower for kw in ["fire", "smoke", "flame", "aag", "dhuwa", "burning", "blaze"]):
            return TextAssessmentSchema(
                suggestedCategory="fire_smoke",
                suggestedUrgency="critical",
                modelScore=0.94,
                scoreMeaning="Relative classifier score, not probability the incident is real.",
                reviewRequired=False,
                explanation="Detected high-frequency thermal keywords ('fire/smoke'). Confidence: 94%.",
                modelVersion="distilbert-emergency-v1-mock",
            )

        # 2. Road Accident
        if any(kw in lower for kw in ["accident", "bike", "car", "collision", "crash", "truck", "scooter"]):
            return TextAssessmentSchema(
                suggestedCategory="road_accident",
                suggestedUrgency="high",
                modelScore=0.89,
                scoreMeaning="Relative classifier score, not probability the incident is real.",
                reviewRequired=False,
                explanation="Vehicle impact terminology detected. Confidence: 89%.",
                modelVersion="distilbert-emergency-v1-mock",
            )

        # 3. Medical Emergency
        if any(kw in lower for kw in ["blood", "unconscious", "heart", "chot", "doctor", "ambulance", "injury", "injured", "pain"]):
            return TextAssessmentSchema(
                suggestedCategory="medical",
                suggestedUrgency="critical",
                modelScore=0.96,
                scoreMeaning="Relative classifier score, not probability the incident is real.",
                reviewRequired=False,
                explanation="Urgent trauma / medical indicator present. Confidence: 96%.",
                modelVersion="distilbert-emergency-v1-mock",
            )

        # 4. Water / Flood
        if any(kw in lower for kw in ["water", "flood", "leak", "pipe", "overflow", "drowning", "paani"]):
            return TextAssessmentSchema(
                suggestedCategory="water_flood",
                suggestedUrgency="medium",
                modelScore=0.85,
                scoreMeaning="Relative classifier score, not probability the incident is real.",
                reviewRequired=False,
                explanation="Water accumulation or infrastructure failure terminology detected. Confidence: 85%.",
                modelVersion="distilbert-emergency-v1-mock",
            )

        # 5. Personal Safety / SOS
        if any(kw in lower for kw in ["stalk", "harass", "threat", "attack", "robbery", "danger", "help me"]):
            return TextAssessmentSchema(
                suggestedCategory="personal_safety",
                suggestedUrgency="critical",
                modelScore=0.91,
                scoreMeaning="Relative classifier score, not probability the incident is real.",
                reviewRequired=False,
                explanation="Threat to personal safety terminology identified. Confidence: 91%.",
                modelVersion="distilbert-emergency-v1-mock",
            )

        # Fallback / General Hazard
        return TextAssessmentSchema(
            suggestedCategory="hazard",
            suggestedUrgency="medium",
            modelScore=0.72,
            scoreMeaning="Relative classifier score, not probability the incident is real.",
            reviewRequired=True,
            explanation="General environmental hazard indicators detected. Confidence: 72%.",
            modelVersion="distilbert-emergency-v1-mock",
        )

    async def _live_inference(self, text: str) -> TextAssessmentSchema:
        # Live inference implementation point (e.g. Gemini, HuggingFace, etc.)
        # If API key not set or network fails, raises exception to trigger fallback
        from app.core.config import settings
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not configured for live model mode")
        # Placeholder for actual live model call
        return self._mock_inference(text)
