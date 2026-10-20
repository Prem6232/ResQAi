import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Boolean, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from app.core.database import Base

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_code = Column(String(50), unique=True, nullable=False, index=True) # e.g. "402", "SOS-19", "118"
    title = Column(String(255), nullable=False)
    category = Column(String(50), nullable=False, index=True)
    urgency = Column(String(50), default="high", nullable=False, index=True)
    status = Column(String(50), default="reported", nullable=False, index=True)
    evidence_label = Column(String(100), default="unverified", nullable=False)
    hide_precise_location = Column(Boolean, default=False, nullable=False)
    location = Column(Geometry(geometry_type="POINT", srid=4326, spatial_index=True), nullable=False)
    location_label = Column(String(255), nullable=True)
    operator_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)

    report_links = relationship("IncidentReport", back_populates="incident", cascade="all, delete-orphan")
    assignments = relationship("Assignment", back_populates="incident", cascade="all, delete-orphan")
    status_events = relationship("IncidentStatusEvent", back_populates="incident", cascade="all, delete-orphan")

class IncidentReport(Base):
    __tablename__ = "incident_reports"

    incident_id = Column(UUID(as_uuid=True), ForeignKey("incidents.id", ondelete="CASCADE"), primary_key=True)
    report_id = Column(UUID(as_uuid=True), ForeignKey("reports.id", ondelete="CASCADE"), primary_key=True)
    linked_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    linked_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    link_reason = Column(String(255), nullable=True)

    incident = relationship("Incident", back_populates="report_links")
    report = relationship("Report", back_populates="incident_links")

class IncidentStatusEvent(Base):
    __tablename__ = "incident_status_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_id = Column(UUID(as_uuid=True), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    from_status = Column(String(50), nullable=True)
    to_status = Column(String(50), nullable=False)
    actor_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_role = Column(String(50), nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    incident = relationship("Incident", back_populates="status_events")
