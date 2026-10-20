from pydantic import BaseModel, Field, model_validator
from typing import Optional, List, Any, Dict
from app.modules.citizen.schemas import ReportResponse

class GeoPointSchema(BaseModel):
    lat: float
    lng: float
    accuracyMeters: Optional[float] = None
    accuracy_meters: Optional[float] = None
    source: Optional[str] = "gps"

class IncidentResponse(BaseModel):
    id: str
    publicCode: str
    public_code: str
    category: str
    urgency: str
    status: str
    title: str
    location: dict
    locationLabel: str
    location_label: str
    reportIds: List[str]
    report_ids: List[str]
    createdAt: str
    created_at: str
    updatedAt: str
    updated_at: str
    evidenceLabel: str
    evidence_label: str
    hidePreciseLocationFromPublic: bool
    hide_precise_location: bool
    synthetic: bool = True

class IncidentStatusEventResponse(BaseModel):
    id: str
    incidentId: str
    incident_id: str
    fromStatus: Optional[str] = None
    from_status: Optional[str] = None
    toStatus: str
    to_status: str
    at: str
    actorRole: str
    actor_role: str
    note: Optional[str] = None

class IncidentDetailResponse(BaseModel):
    incident: IncidentResponse
    linkedReports: List[ReportResponse]
    linked_reports: List[ReportResponse]
    evidence: Dict[str, Any]
    assignments: List[Dict[str, Any]]
    timeline: List[IncidentStatusEventResponse]

class MergeRequest(BaseModel):
    targetIncidentId: Optional[str] = None
    target_incident_id: Optional[str] = None
    reportIds: Optional[List[str]] = None
    report_ids: Optional[List[str]] = None
    reason: str = Field(..., min_length=3)

    @model_validator(mode="before")
    @classmethod
    def reconcile(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("target_incident_id") and data.get("targetIncidentId"):
                data["target_incident_id"] = data["targetIncidentId"]
            if not data.get("report_ids") and data.get("reportIds"):
                data["report_ids"] = data["reportIds"]
        return data

    @property
    def target_id(self) -> str:
        tid = self.target_incident_id or self.targetIncidentId
        if not tid:
            raise ValueError("targetIncidentId is required")
        return tid

    @property
    def reports(self) -> List[str]:
        r = self.report_ids or self.reportIds or []
        if not r:
            raise ValueError("reportIds must not be empty")
        return r

class SplitRequest(BaseModel):
    reportId: Optional[str] = None
    report_id: Optional[str] = None
    reason: str = Field(..., min_length=3)

    @model_validator(mode="before")
    @classmethod
    def reconcile(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("report_id") and data.get("reportId"):
                data["report_id"] = data["reportId"]
        return data

    @property
    def rep_id(self) -> str:
        r = self.report_id or self.reportId
        if not r:
            raise ValueError("reportId is required")
        return r

class StateTransitionRequest(BaseModel):
    incidentId: Optional[str] = None
    incident_id: Optional[str] = None
    toStatus: Optional[str] = None
    to_status: Optional[str] = None
    reason: Optional[str] = Field(default="Status updated by operator")

    @model_validator(mode="before")
    @classmethod
    def reconcile(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("incident_id") and data.get("incidentId"):
                data["incident_id"] = data["incidentId"]
            if not data.get("to_status") and data.get("toStatus"):
                data["to_status"] = data["toStatus"]
        return data

    @property
    def inc_id(self) -> str:
        i = self.incident_id or self.incidentId
        if not i:
            raise ValueError("incidentId is required")
        return i

    @property
    def target_status(self) -> str:
        s = self.to_status or self.toStatus
        if not s:
            raise ValueError("toStatus is required")
        return s

class AIAssessmentOverrideRequest(BaseModel):
    incidentId: Optional[str] = None
    incident_id: Optional[str] = None
    category: Optional[str] = None
    urgency: Optional[str] = None
    reason: str = Field(..., min_length=3)

    @model_validator(mode="before")
    @classmethod
    def reconcile(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("incident_id") and data.get("incidentId"):
                data["incident_id"] = data["incidentId"]
        return data

    @property
    def inc_id(self) -> str:
        i = self.incident_id or self.incidentId
        if not i:
            raise ValueError("incidentId is required")
        return i

class OperatorSettingsSchema(BaseModel):
    autoDispatchEnabled: bool = False
    auto_dispatch_enabled: bool = False
    clusterRadiusMeters: int = 150
    cluster_radius_meters: int = 150
    audioAlertsEnabled: bool = True
    audio_alerts_enabled: bool = True
    triageWindowMinutes: int = 30
    triage_window_minutes: int = 30
    highUrgencyThreshold: float = 0.8
    high_urgency_threshold: float = 0.8

    @model_validator(mode="before")
    @classmethod
    def reconcile(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "autoDispatchEnabled" in data:
                data["auto_dispatch_enabled"] = data["autoDispatchEnabled"]
            if "clusterRadiusMeters" in data:
                data["cluster_radius_meters"] = data["clusterRadiusMeters"]
            if "audioAlertsEnabled" in data:
                data["audio_alerts_enabled"] = data["audioAlertsEnabled"]
            if "triageWindowMinutes" in data:
                data["triage_window_minutes"] = data["triageWindowMinutes"]
            if "highUrgencyThreshold" in data:
                data["high_urgency_threshold"] = data["highUrgencyThreshold"]
        return data

class DuplicatePairing(BaseModel):
    incidentIdA: str
    incidentIdB: str
    incident_id_a: str
    incident_id_b: str
    score: float
    signals: List[str]
    recommendation: str # review, likely_related, weak
