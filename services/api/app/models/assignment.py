import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base

class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_id = Column(UUID(as_uuid=True), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    responder_id = Column(UUID(as_uuid=True), ForeignKey("responder_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(50), default="offered", nullable=False, index=True) # offered, accepted, en_route, arrived, completed, declined, expired, cancelled, failed
    offer_deadline = Column(DateTime, nullable=True)
    offered_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    acknowledged_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    eta_minutes = Column(Integer, nullable=True)
    distance_km = Column(Float, nullable=True)
    route_note = Column(Text, nullable=True)

    incident = relationship("Incident", back_populates="assignments")
    responder = relationship("ResponderProfile", back_populates="assignments")
    events = relationship("AssignmentEvent", back_populates="assignment", cascade="all, delete-orphan")

class AssignmentEvent(Base):
    __tablename__ = "assignment_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assignment_id = Column(UUID(as_uuid=True), ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    from_status = Column(String(50), nullable=True)
    to_status = Column(String(50), nullable=False)
    triggered_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reason = Column(String(255), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    assignment = relationship("Assignment", back_populates="events")
