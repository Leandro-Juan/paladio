from typing import Any

from app.adapters.repositories.sql_user_repository import SqlUserRepository
from app.api.deps import get_current_user
from app.db.models import UserModel
from app.db.session import get_db
from app.schemas.user import (
    UserEmbeddingUpdate,
    UserPreferencesUpdate,
    UserResponse,
)
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def read_user_me(
    current_user: UserModel = Depends(get_current_user),
) -> Any:
    return UserResponse(
        id=current_user.id,
        email=current_user.email or "",
        username=current_user.username or "",
        is_active=current_user.is_active,
        preferences=current_user.preferences or {},
        has_embedding=current_user.embedding is not None
        and len(current_user.embedding) > 0,
        created_at=current_user.created_at.isoformat()
        if current_user.created_at
        else None,
    )


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
    return UserResponse(
        id=updated_user.id,
        email=updated_user.email or "",
        username=updated_user.username or "",
        is_active=updated_user.is_active,
        preferences=updated_user.preferences or {},
        has_embedding=updated_user.embedding is not None
        and len(updated_user.embedding) > 0,
        created_at=updated_user.created_at.isoformat()
        if updated_user.created_at
        else None,
    )


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
