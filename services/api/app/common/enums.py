from enum import Enum

class Role(str, Enum):
    CITIZEN = "citizen"
    RESPONDER = "responder"
    OPERATOR = "operator"
    ADMIN = "admin"

class IncidentCategory(str, Enum):
    FIRE_SMOKE = "fire_smoke"
    ROAD_ACCIDENT = "road_accident"
    MEDICAL = "medical"
    PERSONAL_SAFETY = "personal_safety"
    WATER_FLOOD = "water_flood"
    HAZARD = "hazard"
    OTHER = "other"

class Urgency(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class IncidentStatus(str, Enum):
    REPORTED = "reported"
    UNDER_REVIEW = "under_review"
    CONFIRMED = "confirmed"
    ASSIGNED = "assigned"
    EN_ROUTE = "en_route"
    ON_SCENE = "on_scene"
    RESOLVED = "resolved"
    CLOSED = "closed"
    CANCELLED = "cancelled"
    DUPLICATE = "duplicate"
    UNVERIFIED = "unverified"

class ReportChannel(str, Enum):
    SOS = "sos"
    FORM = "form"
    VOICE = "voice"

class ReportProcessingState(str, Enum):
    RECEIVED = "received"
    QUEUED_FOR_AI = "queued_for_ai"
    AI_COMPLETE = "ai_complete"
    AI_FAILED = "ai_failed"
    CANCELLED = "cancelled"

class DeliveryState(str, Enum):
    LOCAL_SAVED = "local_saved"
    QUEUED = "queued"
    RECEIVED_BY_SERVER = "received_by_server"

class EvidenceLabel(str, Enum):
    UNVERIFIED = "unverified"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"
    POSSIBLE_DUPLICATE = "possible_duplicate"
    CONFLICTING_EVIDENCE = "conflicting_evidence"
    CONFIRMED_BY_OPERATOR = "confirmed_by_operator"
    FALSE_OR_MALICIOUS_AFTER_REVIEW = "false_or_malicious_after_review"

class AssignmentStatus(str, Enum):
    OFFERED = "offered"
    ACCEPTED = "accepted"
    EN_ROUTE = "en_route"
    ARRIVED = "arrived"
    COMPLETED = "completed"
    DECLINED = "declined"
    EXPIRED = "expired"
    CANCELLED = "cancelled"
    FAILED = "failed"

class ResponderAvailability(str, Enum):
    AVAILABLE = "available"
    BUSY = "busy"
    OFF_DUTY = "off_duty"
    OFFLINE = "offline"

class ResponderCapability(str, Enum):
    FIRST_AID = "first_aid"
    FIREFIGHTING = "firefighting"
    RESCUE = "rescue"
    HAZARD = "hazard"
    SECURITY_PATROL = "security_patrol"

class ResponderType(str, Enum):
    CAMPUS_SECURITY = "campus_security"
    VOLUNTEER = "volunteer"
    MEDICAL_VOLUNTEER = "medical_volunteer"
    FIRE_WARDEN = "fire_warden"

class MediaKind(str, Enum):
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"

class OutboxStatus(str, Enum):
    PENDING = "pending"
    PUBLISHED = "published"
    FAILED = "failed"
