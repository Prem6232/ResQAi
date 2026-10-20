from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class TextAssessmentSchema(BaseModel):
    suggestedCategory: str
    suggestedUrgency: str
    modelScore: float
    scoreMeaning: str = "Relative classifier score, not probability the incident is real."
    reviewRequired: bool = False
    explanation: str
    modelVersion: str = "distilbert-emergency-v1-mock"

class VoiceTranscriptionSchema(BaseModel):
    transcript: str
    detectedLanguage: str = "en-IN (English / Hinglish)"
    confidence: float = 0.95
    modelVersion: str = "faster-whisper-medium-mock"

class VisionBoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float
    label: str

class VisionDetectionSchema(BaseModel):
    pipeline: str = "fire_smoke"
    finding: str = "possible_fire_smoke_evidence" # possible_fire_smoke_evidence | no_supported_visual_evidence | unavailable
    modelScore: Optional[float] = 0.95
    modelVersion: str = "yolov8-fire-smoke-v2-mock"
    adapter: str = "labelled_demo_adapter" # live_model | unavailable | labelled_demo_adapter
    explanation: Optional[str] = "Visual fire and dense smoke patterns identified. 95% model confidence. Operator verification required."
    boundingBoxes: List[VisionBoundingBox] = []

class DuplicateCandidateSchema(BaseModel):
    incidentId: str
    score: float
    signals: List[str] = []
    recommendation: str = "review" # review | likely_related | weak

class EvidenceAssessmentSchema(BaseModel):
    linkedReports: int = 1
    temporalConsistency: str = "aligned"
    locationConsistency: str = "aligned"
    reusedMediaFlag: bool = False
    corroboratingVisual: bool = False
    missing: List[str] = []
    conflicting: List[str] = []
    text: Optional[TextAssessmentSchema] = None
    voice: Optional[VoiceTranscriptionSchema] = None
    vision: Optional[VisionDetectionSchema] = None
    duplicates: List[DuplicateCandidateSchema] = []
