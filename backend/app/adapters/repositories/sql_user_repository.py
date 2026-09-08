import logging
from typing import Any, Optional

from app.db.models import UserModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class SqlUserRepository:
    """
    SQLAlchemy repository for Users and their ML embeddings.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, user_id: str) -> Optional[UserModel]:
        stmt = select(UserModel).where(UserModel.id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[UserModel]:
        stmt = select(UserModel).where(UserModel.email == email)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_username(self, username: str) -> Optional[UserModel]:
        stmt = select(UserModel).where(UserModel.username == username)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_username_or_email(self, identifier: str) -> Optional[UserModel]:
        stmt = select(UserModel).where(
            or_(UserModel.username == identifier, UserModel.email == identifier)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_user(
        self,
        user_id: str,
        email: str,
        username: str,
        hashed_password: str,
        embedding: Optional[list[float]] = None,
        preferences: Optional[dict[str, Any]] = None,
    ) -> UserModel:
        from app.schemas.user import get_default_user_preferences

        user = UserModel(
            id=user_id,
            email=email,
            username=username,
            hashed_password=hashed_password,
            is_active=True,
            embedding=embedding if embedding is not None else ([0.1] * 64),
            preferences=preferences
            if preferences is not None
            else get_default_user_preferences(),
        )
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        logger.info(f"Created new user: {username} ({user_id})")
        return user

    async def get_embedding(self, user_id: str) -> Optional[list[float]]:
        stmt = select(UserModel).where(UserModel.id == user_id)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()

        if model and model.embedding is not None:
            return model.embedding
        return None

    async def save_embedding(self, user_id: str, embedding: list[float]) -> None:
        from sqlalchemy.dialects.postgresql import insert

        stmt = insert(UserModel).values(id=user_id, embedding=embedding)
        stmt = stmt.on_conflict_do_update(
            index_elements=["id"], set_={"embedding": stmt.excluded.embedding}
        )
        await self.session.execute(stmt)
        await self.session.commit()
        logger.info(f"Saved ML embedding for user {user_id}.")

    async def update_preferences(
        self, user_id: str, preferences: dict[str, Any]
    ) -> Optional[UserModel]:
        user = await self.get_by_id(user_id)
        if not user:
            from sqlalchemy.dialects.postgresql import insert

            stmt = insert(UserModel).values(id=user_id, preferences=preferences)
            stmt = stmt.on_conflict_do_update(
                index_elements=["id"], set_={"preferences": stmt.excluded.preferences}
            )
            await self.session.execute(stmt)
            await self.session.commit()
            return await self.get_by_id(user_id)

        user.preferences = preferences
        await self.session.commit()
        await self.session.refresh(user)
        return user
