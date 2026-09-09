import uuid
from typing import Any

from app.adapters.repositories.sql_user_repository import SqlUserRepository
from app.api.deps import get_current_admin_user, get_current_user
from app.core.security import hash_password
from app.db.models import UserModel
from app.db.session import get_db
from app.engine.scoring.semantic_learning import SemanticLearningEngine
from app.schemas.user import (
    UserAdminUpdate,
    UserCreate,
    UserEmbeddingUpdate,
    UserPreferencesUpdate,
    UserResponse,
    get_default_user_preferences,
)
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

DEFAULT_INITIAL_EMBEDDING = SemanticLearningEngine.get_neutral_768d_prior(768)


def _user_to_response(u: UserModel) -> UserResponse:
    return UserResponse(
        id=u.id,
        email=u.email or "",
        username=u.username or "",
        role=getattr(u, "role", "user") or "user",
        is_active=u.is_active,
        preferences=u.preferences or {},
        has_embedding=u.embedding is not None and len(u.embedding) > 0,
        created_at=u.created_at.isoformat() if u.created_at else None,
    )


@router.get("/", response_model=list[UserResponse])
async def list_users(
    limit: int = 50,
    offset: int = 0,
    _admin: UserModel = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db),
) -> Any:
    """List all registered users (Master Admin access required)."""
    repo = SqlUserRepository(session)
    users = await repo.list_users(limit=limit, offset=offset)
    return [_user_to_response(u) for u in users]


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user_by_admin(
    user_in: UserCreate,
    _admin: UserModel = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db),
) -> Any:
    """Provision a new user account (Master Admin access required)."""
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
        role=user_in.role or "user",
        embedding=DEFAULT_INITIAL_EMBEDDING,
        preferences=user_in.preferences
        if user_in.preferences
        else get_default_user_preferences(),
    )
    return _user_to_response(user)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user_by_admin(
    user_id: str,
    update_in: UserAdminUpdate,
    admin: UserModel = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db),
) -> Any:
    """Update user role, active status, or password (Master Admin access required)."""
    if user_id == admin.id:
        if update_in.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate your own administrator account.",
            )
        if update_in.role is not None and update_in.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote your own administrator account.",
            )

    repo = SqlUserRepository(session)
    updates: dict[str, Any] = {}
    if update_in.role is not None:
        updates["role"] = update_in.role
    if update_in.is_active is not None:
        updates["is_active"] = update_in.is_active
    if update_in.password:
        updates["hashed_password"] = hash_password(update_in.password)

    updated_user = await repo.update_user_admin(user_id, updates)
    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return _user_to_response(updated_user)


@router.delete("/{user_id}")
async def delete_user_by_admin(
    user_id: str,
    admin: UserModel = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db),
) -> Any:
    """Permanently delete a user account (Master Admin access required)."""
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own administrator account.",
        )

    repo = SqlUserRepository(session)
    success = await repo.delete_user(user_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return {"status": "deleted", "id": user_id}


@router.get("/me", response_model=UserResponse)
async def read_user_me(
    current_user: UserModel = Depends(get_current_user),
) -> Any:
    return _user_to_response(current_user)


@router.put("/me/preferences", response_model=UserResponse)
async def update_preferences(
    pref_in: UserPreferencesUpdate,
    current_user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Any:
    repo = SqlUserRepository(session)
    updated_user = await repo.update_preferences(current_user.id, pref_in.preferences)
    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return _user_to_response(updated_user)


@router.get("/me/embedding")
async def get_embedding(
    current_user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Any:
    repo = SqlUserRepository(session)
    embedding = await repo.get_embedding(current_user.id)
    return {
        "user_id": current_user.id,
        "embedding": embedding,
        "dimension": len(embedding) if embedding else 0,
    }


@router.put("/me/embedding")
async def update_embedding(
    body: UserEmbeddingUpdate,
    current_user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Any:
    repo = SqlUserRepository(session)
    await repo.save_embedding(current_user.id, body.embedding)
    return {
        "status": "success",
        "user_id": current_user.id,
        "dimension": len(body.embedding),
    }
