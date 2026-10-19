import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Boolean, Integer, Float, DateTime, ForeignKey, Enum, JSON
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    role = Column(String(50), nullable=False, default="citizen", index=True) # citizen, responder, operator, admin
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    reports = relationship("Report", back_populates="reporter")
    trusted_contacts = relationship("TrustedContact", back_populates="user")
    responder_profile = relationship("ResponderProfile", back_populates="user", uselist=False)

class TrustedContact(Base):
    __tablename__ = "trusted_contacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=False)
    relationship_label = Column(String(100), nullable=True) # e.g. Brother, Friend, Neighbor
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="trusted_contacts")

class OperatingArea(Base):
    __tablename__ = "operating_areas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    boundary = Column(Geometry(geometry_type="POLYGON", srid=4326), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class ResponderProfile(Base):
    __tablename__ = "responder_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    unit_code = Column(String(50), nullable=False, unique=True) # e.g. "F-2", "A-12"
    capabilities = Column(JSON, default=list) # e.g. ["fire_fighting", "rescue", "first_aid"]
    is_on_duty = Column(Boolean, default=False, nullable=False)
    availability_status = Column(String(50), default="off_duty", nullable=False) # available, busy, off_duty
    last_known_location = Column(Geometry(geometry_type="POINT", srid=4326), nullable=True)
    last_ping_at = Column(DateTime, nullable=True)
    is_approved = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="responder_profile")
    assignments = relationship("Assignment", back_populates="responder")

class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reporter_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    category = Column(String(50), nullable=False) # fire_smoke, road_accident, medical, personal_safety, other
    urgency = Column(String(50), default="high", nullable=False) # low, medium, high, critical
    raw_text = Column(Text, nullable=True)
    location = Column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    location_label = Column(String(255), nullable=True)
    status = Column(String(50), default="submitted", nullable=False) # submitted, in_review, linked, rejected, cancelled
    is_offline_draft = Column(Boolean, default=False, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    reporter = relationship("User", back_populates="reports")
    media_assets = relationship("MediaAsset", back_populates="report", cascade="all, delete-orphan")
    ai_assessments = relationship("AIAssessment", back_populates="report", cascade="all, delete-orphan")
    incident_links = relationship("IncidentReport", back_populates="report")

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_number = Column(Integer, autoincrement=True, unique=True, index=True) # human readable incident #
    title = Column(String(255), nullable=False)
    category = Column(String(50), nullable=False)
    urgency = Column(String(50), default="high", nullable=False)
    status = Column(String(50), default="reported", nullable=False) # reported, under_review, confirmed, assigned, en_route, on_scene, resolved, closed, cancelled
    location = Column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    location_label = Column(String(255), nullable=True)
    operator_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)

    report_links = relationship("IncidentReport", back_populates="incident")
    assignments = relationship("Assignment", back_populates="incident")

class IncidentReport(Base):
    __tablename__ = "incident_reports"

    incident_id = Column(UUID(as_uuid=True), ForeignKey("incidents.id", ondelete="CASCADE"), primary_key=True)
    report_id = Column(UUID(as_uuid=True), ForeignKey("reports.id", ondelete="CASCADE"), primary_key=True)
    linked_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    linked_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    link_reason = Column(String(255), nullable=True)

    incident = relationship("Incident", back_populates="report_links")
    report = relationship("Report", back_populates="incident_links")

class MediaAsset(Base):
    __tablename__ = "media_assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_id = Column(UUID(as_uuid=True), ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True)
    file_type = Column(String(50), nullable=False) # image, audio, video
    s3_key = Column(String(500), nullable=False)
    file_size_bytes = Column(Integer, nullable=True)
    mime_type = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    report = relationship("Report", back_populates="media_assets")

class AIAssessment(Base):
    __tablename__ = "ai_assessments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_id = Column(UUID(as_uuid=True), ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True)
    pipeline_type = Column(String(100), nullable=False) # text_classifier, voice_transcription, vision_fire_smoke, duplicate_matching, llm_summary
    model_name = Column(String(100), nullable=False)
    model_version = Column(String(50), nullable=False)
    confidence_score = Column(Float, nullable=True)
    explanation = Column(Text, nullable=True)
    raw_output = Column(JSON, default=dict)
    is_flagged_uncertain = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    report = relationship("Report", back_populates="ai_assessments")

class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_id = Column(UUID(as_uuid=True), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    responder_id = Column(UUID(as_uuid=True), ForeignKey("responder_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(50), default="offered", nullable=False) # offered, accepted, declined, en_route, arrived, completed, expired, cancelled
    offer_deadline = Column(DateTime, nullable=True)
    offered_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    incident = relationship("Incident", back_populates="assignments")
    responder = relationship("ResponderProfile", back_populates="assignments")
    events = relationship("AssignmentEvent", back_populates="assignment", cascade="all, delete-orphan")

class AssignmentEvent(Base):
    __tablename__ = "assignment_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assignment_id = Column(UUID(as_uuid=True), ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    from_status = Column(String(50), nullable=False)
    to_status = Column(String(50), nullable=False)
    triggered_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reason = Column(String(255), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    assignment = relationship("Assignment", back_populates="events")

class OutboxEvent(Base):
    __tablename__ = "outbox_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    aggregate_type = Column(String(100), nullable=False, index=True) # e.g. "Report", "Incident", "Assignment"
    aggregate_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    event_type = Column(String(100), nullable=False) # e.g. "REPORT_CREATED", "ASSIGNMENT_OFFERED"
    payload = Column(JSON, nullable=False)
    status = Column(String(50), default="pending", nullable=False, index=True) # pending, published, failed
    retry_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    processed_at = Column(DateTime, nullable=True)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String(100), nullable=False) # e.g. "OVERRIDE_CATEGORY", "MERGE_REPORTS", "DISPATCH_RESPONDER"
    target_entity = Column(String(100), nullable=False)
    target_id = Column(String(100), nullable=False)
    details = Column(JSON, default=dict)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
