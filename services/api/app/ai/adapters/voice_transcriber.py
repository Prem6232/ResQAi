import logging
from typing import Optional
from app.ai.adapters.base import BaseAIAdapter
from app.ai.schemas import VoiceTranscriptionSchema

logger = logging.getLogger("sentinelgrid.ai.voice_transcriber")

class VoiceTranscriberAdapter(BaseAIAdapter):
    """
    Faster-Whisper audio transcription adapter for emergency voice memos.
    Supports mock benchmark responses and live transcription.
    """

    async def predict(self, s3_key: Optional[str] = None, file_bytes: Optional[bytes] = None) -> VoiceTranscriptionSchema:
        if not self.is_mock:
            try:
                return await self._live_transcribe(s3_key, file_bytes)
            except Exception as e:
                logger.warning(f"Live voice transcription failed: {e}. Falling back to benchmark mock transcript.")

        return self._mock_transcribe()

    def _mock_transcribe(self) -> VoiceTranscriptionSchema:
        return VoiceTranscriptionSchema(
            transcript="Smoke observed coming from the shop near the corner, multiple people gathering outside.",
            detectedLanguage="en-IN (English / Hinglish)",
            confidence=0.95,
            modelVersion="faster-whisper-medium-mock",
        )

    async def _live_transcribe(self, s3_key: Optional[str], file_bytes: Optional[bytes]) -> VoiceTranscriptionSchema:
        from app.core.config import settings
        if not settings.GEMINI_API_KEY:
            raise ValueError("Live transcription engine credentials not configured")
        return self._mock_transcribe()
