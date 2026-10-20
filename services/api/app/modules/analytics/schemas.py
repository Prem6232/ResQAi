from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, ConfigDict

class AnalyticsSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    total_incidents: int = Field(alias="totalIncidents", default=0)
    active_incidents: int = Field(alias="activeIncidents", default=0)
    resolved_incidents: int = Field(alias="resolvedIncidents", default=0)
    open_reports_count: int = Field(alias="openReportsCount", default=0)
    active_responders_count: int = Field(alias="activeRespondersCount", default=0)
    avg_arrival_time_minutes: float = Field(alias="avgArrivalTimeMinutes", default=0.0)
    avg_response_time_seconds: float = Field(alias="avgResponseTimeSeconds", default=0.0)
    false_alarm_rate: float = Field(alias="falseAlarmRate", default=0.0)
    synthetic_drill_mode: bool = Field(alias="syntheticDrillMode", default=True)

class HotspotGeometry(BaseModel):
    type: str = "Point"
    coordinates: List[float] # [lng, lat]

class HotspotProperties(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    incident_id: str = Field(alias="incidentId")
    title: str
    category: str
    urgency: str
    status: str
    weight: float

class HotspotFeature(BaseModel):
    type: str = "Feature"
    geometry: HotspotGeometry
    properties: HotspotProperties

class HotspotFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[HotspotFeature]

class CategoryCount(BaseModel):
    category: str
    name: str
    count: int
    percentage: float

class CategoryBreakdown(BaseModel):
    categories: List[CategoryCount]
    total: int

class ResponseMilestone(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    phase: str
    avg_seconds: float = Field(alias="avgSeconds")
    p95_seconds: float = Field(alias="p95Seconds")

class TimelinePoint(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    date: str
    avg_response_seconds: float = Field(alias="avgResponseSeconds")
    count: int

class ResponseTimeStats(BaseModel):
    milestones: List[ResponseMilestone]
    timeline: List[TimelinePoint]
