import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from app.core.database import Base

class ResponderProfile(Base):
    __tablename__ = "responder_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    unit_code = Column(String(50), nullable=False, unique=True, index=True) # e.g. "F-2", "A-12"
    display_name = Column(String(255), nullable=True)
    responder_type = Column(String(50), default="campus_security", nullable=False) # campus_security, volunteer, medical_volunteer, fire_warden
    capabilities = Column(JSON, default=list) # ["first_aid", "firefighting", "rescue", "hazard", "security_patrol"]
    is_on_duty = Column(Boolean, default=False, nullable=False, index=True)
    availability_status = Column(String(50), default="off_duty", nullable=False, index=True) # available, busy, off_duty, offline
    share_location = Column(Boolean, default=True, nullable=False)
    last_known_location = Column(Geometry(geometry_type="POINT", srid=4326, spatial_index=True), nullable=True)
    last_ping_at = Column(DateTime, nullable=True)
    is_approved = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="responder_profile")
    assignments = relationship("Assignment", back_populates="responder")
