from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=128)
    preferences: Optional[dict[str, Any]] = None


class UserLogin(BaseModel):
    username_or_email: str
    password: str


class UserPreferencesUpdate(BaseModel):
    preferences: dict[str, Any]


class UserEmbeddingUpdate(BaseModel):
    embedding: list[float]


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    is_active: bool
    preferences: Optional[dict[str, Any]] = None
    has_embedding: bool = False
    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
