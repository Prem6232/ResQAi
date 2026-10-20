import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Boolean, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from app.core.database import Base

class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reporter_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    channel = Column(String(50), default="form", nullable=False) # sos, form, voice
    category = Column(String(50), nullable=False, index=True) # fire_smoke, road_accident, medical, personal_safety, water_flood, hazard, other
    urgency = Column(String(50), default="high", nullable=False, index=True) # low, medium, high, critical
    raw_text = Column(Text, nullable=True)
    location = Column(Geometry(geometry_type="POINT", srid=4326, spatial_index=True), nullable=False)
    location_label = Column(String(255), nullable=True)
    status = Column(String(50), default="submitted", nullable=False, index=True) # submitted, in_review, linked, rejected, cancelled
    processing_state = Column(String(50), default="received", nullable=False, index=True) # received, queued_for_ai, ai_complete, ai_failed, cancelled
    delivery_state = Column(String(50), default="received_by_server", nullable=False) # local_saved, queued, received_by_server
    is_offline_draft = Column(Boolean, default=False, nullable=False)
    idempotency_key = Column(String(255), unique=True, nullable=True, index=True)
    cancelled_reason = Column(String(255), nullable=True)
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    reporter = relationship("User", back_populates="reports")
    media_assets = relationship("MediaAsset", back_populates="report", cascade="all, delete-orphan")
    ai_assessments = relationship("AIAssessment", back_populates="report", cascade="all, delete-orphan")
    incident_links = relationship("IncidentReport", back_populates="report")

class MediaAsset(Base):
    __tablename__ = "media_assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_id = Column(UUID(as_uuid=True), ForeignKey("reports.id", ondelete="CASCADE"), nullable=True, index=True)
    file_type = Column(String(50), nullable=False) # image, audio, video
    file_name = Column(String(255), nullable=True)
    s3_key = Column(String(500), nullable=False)
    file_size_bytes = Column(Integer, nullable=True)
    mime_type = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    report = relationship("Report", back_populates="media_assets")
