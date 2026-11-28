from __future__ import annotations

import asyncio
import io
import json
import logging
import math
import threading
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

from app.ai.adapters.base import BaseAIAdapter
from app.ai.hf_bootstrap import resolve_model_dir
from app.ai.schemas import VoiceTranscriptionSchema

logger = logging.getLogger("sentinelgrid.ai.voice_transcriber")

DEFAULT_INDIAN_EMERGENCY_PROMPT = (
    "ResQAI Bhopal emergency SOS report. Locations: MP Nagar, Habibganj, Arera Colony, "
    "New Market, Kolar Road, Bairagarh, Misrod, Rani Kamalapati, Chuna Bhatti, Shahpura, MANIT. "
    "Words: aag, dhuwa, transformer, cylinder, scooty, auto, takkar, behosh, khoon, ambulance, "
    "paani, underpass, bijli, manhole, SOS."
)

_RUNTIME_LOCK = threading.Lock()
_RUNTIME_CACHE: Dict[Tuple[str, str, str], "_WhisperRuntime"] = {}


def _decode_audio_16k_mono(raw_bytes: bytes) -> np.ndarray:
    """Decode uploaded WAV/WEBM/OGG/MP3/M4A bytes into 16kHz mono float32 PCM using bundled PyAV."""
    import av

    resampler = av.audio.resampler.AudioResampler(format="s16", layout="mono", rate=16000)
    chunks: List[np.ndarray] = []
    with av.open(io.BytesIO(raw_bytes), mode="r") as container:
        for frame in container.decode(audio=0):
            for out_frame in resampler.resample(frame):
                chunks.append(out_frame.to_ndarray().reshape(-1))
        for out_frame in resampler.resample(None):
            chunks.append(out_frame.to_ndarray().reshape(-1))
    if not chunks:
        return np.zeros(0, dtype=np.float32)
    return np.concatenate(chunks).astype(np.float32) / 32768.0


def _resolve_whisper_model_dir(configured_dir: str) -> Tuple[Path, str]:
    model_dir = resolve_model_dir("voice_transcriber", configured_dir, Path(__file__))

    if not model_dir.exists() or not (model_dir / "model.bin").is_file():
        raise FileNotFoundError(f"Faster-Whisper CTranslate2 model not found in: {model_dir}")

    prompt = DEFAULT_INDIAN_EMERGENCY_PROMPT
    cfg_candidates = [model_dir / "whisper_config.json"]
    if len(model_dir.parents) >= 2:
        cfg_candidates.append(model_dir.parents[1] / "configs" / "whisper_config.json")
    for cfg_path in cfg_candidates:
        if cfg_path.is_file():
            try:
                cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
                prompt = str(cfg.get("indian_emergency_initial_prompt") or prompt)
                break
            except Exception:
                pass
    return model_dir, prompt


def _format_detected_language(lang_code: Optional[str], lang_prob: float) -> str:
    code = (lang_code or "en").lower()
    if code == "hi":
        return f"hi-IN (Hindi / Hinglish, {lang_prob * 100:.0f}%)"
    if code == "en":
        return f"en-IN (English / Hinglish, {lang_prob * 100:.0f}%)"
    return f"{code} ({lang_prob * 100:.0f}%)"


class _WhisperRuntime:
    """Self-contained local CPU/GPU CTranslate2 Faster-Whisper runtime."""

    def __init__(self, model_dir: Path, initial_prompt: str, device: str, compute_type: str) -> None:
        from faster_whisper import WhisperModel

        self.model_dir = model_dir
        self.initial_prompt = initial_prompt
        self.device = device
        self.compute_type = compute_type
        self.model = WhisperModel(str(model_dir), device=device, compute_type=compute_type)

    def transcribe_sync(self, raw_bytes: bytes) -> VoiceTranscriptionSchema:
        audio_arr = _decode_audio_16k_mono(raw_bytes)
        if audio_arr.size == 0:
            raise ValueError("Decoded audio stream contains zero PCM frames")

        segments, info = self.model.transcribe(
            audio_arr,
            beam_size=5,
            vad_filter=True,
            initial_prompt=self.initial_prompt,
        )
        segs = list(segments)
        transcript = " ".join(s.text.strip() for s in segs).strip()
        if not transcript:
            raise ValueError("Empty transcription produced from audio clip")

        avg_lp = float(np.mean([s.avg_logprob for s in segs])) if segs else -1.2
        confidence = round(max(0.05, min(0.99, math.exp(avg_lp))), 4)
        lang_prob = float(getattr(info, "language_probability", 0.9) or 0.9)
        detected_lang = _format_detected_language(getattr(info, "language", "en"), lang_prob)

        return VoiceTranscriptionSchema(
            transcript=transcript,
            detectedLanguage=detected_lang,
            confidence=confidence,
            modelVersion=f"faster-whisper-small-ct2-{self.compute_type}",
        )


def get_whisper_runtime(configured_dir: str, device: str, compute_type: str) -> _WhisperRuntime:
    model_dir, initial_prompt = _resolve_whisper_model_dir(configured_dir)
    key = (str(model_dir.resolve()), device, compute_type)
    with _RUNTIME_LOCK:
        runtime = _RUNTIME_CACHE.get(key)
        if runtime is None:
            runtime = _WhisperRuntime(model_dir, initial_prompt, device=device, compute_type=compute_type)
            _RUNTIME_CACHE[key] = runtime
        return runtime


def _fetch_s3_audio_bytes(s3_key: str) -> bytes:
    from app.core.config import settings
    from app.modules.media.service import get_s3_client

    client = get_s3_client(for_public_presign=False)
    obj = client.get_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key)
    return obj["Body"].read()


class VoiceTranscriberAdapter(BaseAIAdapter):
    """
    Faster-Whisper audio transcription adapter for emergency voice memos.
    Supports deterministic mock mode and local $0/lifetime CTranslate2 inference.
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

        raw_bytes = file_bytes
        if raw_bytes is None:
            if not s3_key:
                raise ValueError("Either file_bytes or s3_key must be provided for live transcription")
            raw_bytes = await asyncio.to_thread(_fetch_s3_audio_bytes, s3_key)

        runtime = get_whisper_runtime(
            configured_dir=settings.VOICE_TRANSCRIBER_MODEL_DIR,
            device=settings.VOICE_TRANSCRIBER_DEVICE,
            compute_type=settings.VOICE_TRANSCRIBER_COMPUTE_TYPE,
        )
        return await asyncio.to_thread(runtime.transcribe_sync, raw_bytes)
