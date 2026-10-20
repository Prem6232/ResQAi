from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Optional, List, Any

class RegisterPayload(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Minimum 8 characters")
    full_name: Optional[str] = None
    name: Optional[str] = None # Web frontend compatibility
    phone: Optional[str] = None
    role: str = Field(default="citizen", description="Role: 'citizen' or 'responder'")
    responder_type: Optional[str] = Field(default="campus_security", description="Subtype if responder")
    capabilities: Optional[List[str]] = Field(default_factory=lambda: ["first_aid"])
    campus_code: Optional[str] = None
    campusCode: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def reconcile_names(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("full_name") and data.get("name"):
                data["full_name"] = data["name"]
        return data

class LoginPayload(BaseModel):
    email: EmailStr
    password: str

class RefreshTokenRequest(BaseModel):
    refresh_token: Optional[str] = None
    refreshToken: Optional[str] = None # Web camelCase

    @property
    def token(self) -> str:
        t = self.refresh_token or self.refreshToken
        if not t:
            raise ValueError("refresh_token is required")
        return t

class ResponderProfileSummary(BaseModel):
    id: str
    unit_code: str
    display_name: Optional[str] = None
    responder_type: str
    capabilities: List[str]
    is_on_duty: bool
    availability_status: str
    is_approved: bool

class UserProfileResponse(BaseModel):
    id: str
    email: str
    full_name: str
    name: str # Mirror for frontend SessionUser
    role: str
    roles: List[str] # List format for frontend SessionUser
    activeRole: str # Mirror for frontend SessionUser
    phone: Optional[str] = None
    is_active: bool = True
    campus_name: str = "Northridge Campus (synthetic)"
    campusName: str = "Northridge Campus (synthetic)"
    is_approved: Optional[bool] = None
    responder_profile: Optional[ResponderProfileSummary] = None

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_at: int # Milliseconds
    accessToken: str # Frontend camelCase
    refreshToken: str # Frontend camelCase
    expiresAt: int # Frontend camelCase
    user: UserProfileResponse

class LogoutResponse(BaseModel):
    ok: bool = True
    message: str = "Successfully logged out"
