from pydantic import BaseModel, Field, model_validator
from typing import Optional, List, Dict, Any, Literal

class AssignmentEventResponse(BaseModel):
    id: str
    assignmentId: str
    assignment_id: str
    fromStatus: Optional[str] = None
    toStatus: str
    at: str
    reason: Optional[str] = None
    note: Optional[str] = None

class AssignmentResponse(BaseModel):
    id: str
    incidentId: str
    incident_id: str
    responderId: str
    responder_id: str
    slotId: str
    status: str
    offeredAt: str
    offered_at: str
    offerDeadline: Optional[str] = None
    offer_deadline: Optional[str] = None
    acknowledgedAt: Optional[str] = None
    acknowledged_at: Optional[str] = None
    completedAt: Optional[str] = None
    completed_at: Optional[str] = None
    etaMinutes: Optional[int] = None
    eta_minutes: Optional[int] = None
    distanceKm: Optional[float] = None
    distance_km: Optional[float] = None
    routeNote: Optional[str] = None
    route_note: Optional[str] = None
    incident: Optional[Dict[str, Any]] = None
    synthetic: bool = True

class OfferResponseRequest(BaseModel):
    status: Literal["accepted", "declined"]
    reason: Optional[str] = None

class AssignmentStatusUpdateRequest(BaseModel):
    status: str # accepted, en_route, arrived, on_scene, completed, failed, cancelled
    reason: Optional[str] = None
    explanation: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def reconcile(cls, data: Any) -> Any:
        if isinstance(data, dict):
            st = data.get("status") or data.get("targetStatus") or data.get("target_status") or data.get("toStatus") or data.get("to_status")
            if st:
                data["status"] = st
        return data

class LocationPingRequest(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    accuracyMeters: Optional[float] = None
    accuracy_meters: Optional[float] = None
    source: Optional[str] = "gps"

    @model_validator(mode="before")
    @classmethod
    def reconcile(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("accuracyMeters") and data.get("accuracy_meters"):
                data["accuracyMeters"] = data["accuracy_meters"]
        return data

class DutyUpdateRequest(BaseModel):
    isOnDuty: Optional[bool] = None
    is_on_duty: Optional[bool] = None
    availabilityStatus: Optional[str] = None # available, busy, off_duty, offline
    availability_status: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def reconcile(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if data.get("isOnDuty") is not None and data.get("is_on_duty") is None:
                data["is_on_duty"] = data["isOnDuty"]
            if data.get("availabilityStatus") and not data.get("availability_status"):
                data["availability_status"] = data["availabilityStatus"]
        return data

class AssignmentNotesRequest(BaseModel):
    notes: str = Field(..., min_length=1)

class DispatchOfferRequest(BaseModel):
    incidentId: Optional[str] = None
    incident_id: Optional[str] = None
    responderId: Optional[str] = None
    responder_id: Optional[str] = None
    note: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def reconcile(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("incident_id") and data.get("incidentId"):
                data["incident_id"] = data["incidentId"]
            if not data.get("responder_id") and data.get("responderId"):
                data["responder_id"] = data["responderId"]
        return data

    @property
    def target_incident_id(self) -> str:
        return self.incident_id or self.incidentId

    @property
    def target_responder_id(self) -> str:
        return self.responder_id or self.responderId

class DispatchRecommendation(BaseModel):
    responderId: str
    unitCode: str
    displayName: str
    responderType: str
    capabilities: List[str]
    distanceKm: float
    etaMinutes: int
    score: float
    matchReason: str
