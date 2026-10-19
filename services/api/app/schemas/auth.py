from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from uuid import UUID

class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=2)
    phone: Optional[str] = None
    role: str = Field(default="citizen", pattern="^(citizen|responder|operator|admin)$")

class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: UUID
    role: str
    full_name: str

class UserProfileResponse(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    role: str
    phone: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True
