import os
import uuid
from typing import Any

from app.adapters.repositories.sql_user_repository import SqlUserRepository
from app.api.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import UserModel
from app.db.session import get_db
from app.engine.scoring.semantic_learning import SemanticLearningEngine
from app.schemas.user import (
    MasterAdminSetup,
    SetupStatusResponse,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserResponse,
    get_default_user_preferences,
)
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

DEFAULT_INITIAL_EMBEDDING = SemanticLearningEngine.get_neutral_768d_prior(768)


def _build_user_response(user: UserModel) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email or "",
        username=user.username or "",
        role=getattr(user, "role", "user") or "user",
        is_active=user.is_active,
        preferences=user.preferences or {},
        has_embedding=user.embedding is not None and len(user.embedding) > 0,
        created_at=user.created_at.isoformat() if user.created_at else None,
    )


@router.get("/setup-status", response_model=SetupStatusResponse)
async def get_setup_status(
    session: AsyncSession = Depends(get_db),
) -> Any:
    repo = SqlUserRepository(session)
    count = await repo.count_users()
    return SetupStatusResponse(
        setup_required=(count == 0),
        user_count=count,
    )


@router.post(
    "/setup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED
)
async def setup_initial_admin(
    setup_in: MasterAdminSetup,
    session: AsyncSession = Depends(get_db),
) -> Any:
    repo = SqlUserRepository(session)
    count = await repo.count_users()
    if count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Paladio instance is already initialized. Initial setup is closed.",
        )

    user_id = str(uuid.uuid4())
    hashed_pwd = hash_password(setup_in.password)
    user = await repo.create_user(
        user_id=user_id,
        email=setup_in.email,
        username=setup_in.username,
        hashed_password=hashed_pwd,
        role="admin",
        embedding=DEFAULT_INITIAL_EMBEDDING,
        preferences=get_default_user_preferences(),
    )

    access_token = create_access_token(user.id)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=_build_user_response(user),
    )


@router.post(
    "/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED
)
async def register(
    user_in: UserCreate,
    session: AsyncSession = Depends(get_db),
) -> Any:
    repo = SqlUserRepository(session)
    user_count = await repo.count_users()

    # If first user, auto-promote to admin.
    if user_count == 0:
        assigned_role = "admin"
    else:
        allow_public = os.getenv("ALLOW_PUBLIC_REGISTRATION", "false").lower() in (
            "true",
            "1",
        )
        if not allow_public:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Public registration is disabled on this self-hosted instance. Accounts must be provisioned by an administrator in Configuration.",
            )
        assigned_role = user_in.role or "user"

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
        role=assigned_role,
        embedding=DEFAULT_INITIAL_EMBEDDING,
        preferences=user_in.preferences
        if user_in.preferences
        else get_default_user_preferences(),
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
