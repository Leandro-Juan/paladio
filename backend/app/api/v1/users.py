import uuid
from typing import Any

from app.adapters.repositories.sql_user_repository import SqlUserRepository
from app.api.deps import get_current_admin_user, get_current_user, get_optional_user
from app.core.security import hash_password
from app.db.models import UserModel
from app.db.session import get_db
from app.engine.scoring.semantic_learning import SemanticLearningEngine
from app.schemas.user import (
    UserAdminUpdate,
    UserCreate,
    UserEmbeddingUpdate,
    UserPreferencesUpdate,
    UserProfileUpdate,
    UserResponse,
    get_default_user_preferences,
)
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

DEFAULT_INITIAL_EMBEDDING = SemanticLearningEngine.get_neutral_768d_prior(768)


class CollaboratorOption(BaseModel):
    id: str
    username: str
    email: str


@router.get("/collaborators/options", response_model=list[CollaboratorOption])
async def list_collaborator_options(
    session: AsyncSession = Depends(get_db),
    _current_user: UserModel | None = Depends(get_optional_user),
) -> Any:
    """List registered users available to be added as collaborators on trips."""
    stmt = (
        select(UserModel)
        .where(UserModel.is_active.is_(True))
        .order_by(UserModel.username.asc())
    )
    res = await session.execute(stmt)
    users = res.scalars().all()
    return [
        CollaboratorOption(
            id=u.id,
            username=u.username or "Anonymous",
            email=u.email or "",
        )
        for u in users
    ]


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

    if user_in.email:
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
        username=user_in.username,
        hashed_password=hashed_pwd,
        email=user_in.email,
        role=user_in.role or "user",
        embedding=DEFAULT_INITIAL_EMBEDDING,
        preferences=user_in.preferences
        if user_in.preferences
        else get_default_user_preferences(),
    )
    return _user_to_response(user)


@router.get("/me", response_model=UserResponse)
async def read_user_me(
    current_user: UserModel = Depends(get_current_user),
) -> Any:
    return _user_to_response(current_user)


@router.patch("/me", response_model=UserResponse)
async def update_user_me(
    profile_in: UserProfileUpdate,
    current_user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Any:
    """Allow any authenticated user to update their own profile (username, email, password, avatar_url, preferences)."""
    repo = SqlUserRepository(session)
    updates: dict[str, Any] = {}

    if profile_in.username is not None and profile_in.username != current_user.username:
        existing_username = await repo.get_by_username(profile_in.username)
        if existing_username and existing_username.id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this username already exists",
            )
        updates["username"] = profile_in.username

    if profile_in.email is not None and profile_in.email != current_user.email:
        if profile_in.email:
            existing_email = await repo.get_by_email(profile_in.email)
            if existing_email and existing_email.id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A user with this email already exists",
                )
            updates["email"] = profile_in.email
        else:
            updates["email"] = None

    if profile_in.password:
        updates["hashed_password"] = hash_password(profile_in.password)

    if profile_in.avatar_url is not None or profile_in.preferences is not None:
        current_prefs = dict(current_user.preferences or {})
        if profile_in.preferences is not None:
            current_prefs.update(profile_in.preferences)
        if profile_in.avatar_url is not None:
            current_prefs["avatar_url"] = profile_in.avatar_url
        updates["preferences"] = current_prefs

    updated_user = await repo.update_user_admin(current_user.id, updates)
    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return _user_to_response(updated_user)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user_by_admin(
    user_id: str,
    update_in: UserAdminUpdate,
    admin: UserModel = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db),
) -> Any:
    """Update user role, active status, credentials, or profile (Master Admin access required)."""
    repo = SqlUserRepository(session)
    target_user = await repo.get_by_id(user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

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

    updates: dict[str, Any] = {}
    if update_in.username is not None and update_in.username != target_user.username:
        existing_username = await repo.get_by_username(update_in.username)
        if existing_username and existing_username.id != user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this username already exists",
            )
        updates["username"] = update_in.username

    if update_in.email is not None and update_in.email != target_user.email:
        if update_in.email:
            existing_email = await repo.get_by_email(update_in.email)
            if existing_email and existing_email.id != user_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A user with this email already exists",
                )
            updates["email"] = update_in.email
        else:
            updates["email"] = None

    if update_in.role is not None:
        updates["role"] = update_in.role
    if update_in.is_active is not None:
        updates["is_active"] = update_in.is_active
    if update_in.password:
        updates["hashed_password"] = hash_password(update_in.password)

    if update_in.avatar_url is not None or update_in.preferences is not None:
        current_prefs = dict(target_user.preferences or {})
        if update_in.preferences is not None:
            current_prefs.update(update_in.preferences)
        if update_in.avatar_url is not None:
            current_prefs["avatar_url"] = update_in.avatar_url
        updates["preferences"] = current_prefs

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
    emb_list = (
        embedding.tolist()
        if hasattr(embedding, "tolist")
        else (list(embedding) if embedding is not None else None)
    )
    return {
        "user_id": current_user.id,
        "embedding": emb_list,
        "dimension": len(emb_list) if emb_list is not None else 0,
    }


@router.put("/me/embedding")
async def update_embedding(
    body: UserEmbeddingUpdate,
    current_user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Any:
    repo = SqlUserRepository(session)
    user_id = current_user.id
    await repo.save_embedding(user_id, body.embedding)
    return {
        "status": "success",
        "user_id": user_id,
        "dimension": len(body.embedding),
    }
