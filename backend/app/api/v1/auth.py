import uuid
from typing import Any

from app.adapters.repositories.sql_user_repository import SqlUserRepository
from app.api.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import UserModel
from app.db.session import get_db
from app.schemas.user import TokenResponse, UserCreate, UserLogin, UserResponse
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


def _build_user_response(user: UserModel) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email or "",
        username=user.username or "",
        is_active=user.is_active,
        preferences=user.preferences or {},
        has_embedding=user.embedding is not None and len(user.embedding) > 0,
        created_at=user.created_at.isoformat() if user.created_at else None,
    )


@router.post(
    "/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED
)
async def register(
    user_in: UserCreate,
    session: AsyncSession = Depends(get_db),
) -> Any:
    repo = SqlUserRepository(session)

    existing_email = await repo.get_by_email(user_in.email)
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists",
        )

    existing_username = await repo.get_by_username(user_in.username)
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this username already exists",
        )

    user_id = str(uuid.uuid4())
    hashed_pwd = hash_password(user_in.password)
    user = await repo.create_user(
        user_id=user_id,
        email=user_in.email,
        username=user_in.username,
        hashed_password=hashed_pwd,
        embedding=[0.1] * 64,
        preferences=user_in.preferences or {},
    )

    access_token = create_access_token(user.id)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=_build_user_response(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    login_in: UserLogin,
    session: AsyncSession = Depends(get_db),
) -> Any:
    repo = SqlUserRepository(session)
    user = await repo.get_by_username_or_email(login_in.username_or_email)

    if not user or not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(login_in.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    access_token = create_access_token(user.id)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=_build_user_response(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: UserModel = Depends(get_current_user),
) -> Any:
    return _build_user_response(current_user)
