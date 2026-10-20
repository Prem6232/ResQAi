import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Boolean, Float, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base

class AIAssessment(Base):
    __tablename__ = "ai_assessments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_id = Column(UUID(as_uuid=True), ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True)
    pipeline_type = Column(String(100), nullable=False, index=True) # text_classifier, voice_transcription, vision_fire_smoke, duplicate_matching, llm_summary
    model_name = Column(String(100), nullable=False)
    model_version = Column(String(50), nullable=False)
    confidence_score = Column(Float, nullable=True)
    explanation = Column(Text, nullable=True)
    raw_output = Column(JSON, default=dict)
    is_flagged_uncertain = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    report = relationship("Report", back_populates="ai_assessments")
