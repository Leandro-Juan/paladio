import logging
from typing import Any

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

    async def get_by_id(self, user_id: str) -> UserModel | None:
        stmt = select(UserModel).where(UserModel.id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> UserModel | None:
        stmt = select(UserModel).where(UserModel.email == email)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_username(self, username: str) -> UserModel | None:
        stmt = select(UserModel).where(UserModel.username == username)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_username_or_email(self, identifier: str) -> UserModel | None:
        stmt = select(UserModel).where(
            or_(UserModel.username == identifier, UserModel.email == identifier)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def count_users(self) -> int:
        from sqlalchemy import func

        stmt = select(func.count(UserModel.id)).where(
            UserModel.username.isnot(None), UserModel.hashed_password.isnot(None)
        )
        result = await self.session.execute(stmt)
        return result.scalar() or 0

    async def list_users(self, limit: int = 50, offset: int = 0) -> list[UserModel]:
        stmt = (
            select(UserModel)
            .where(UserModel.username.isnot(None))
            .order_by(UserModel.created_at.asc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create_user(
        self,
        user_id: str,
        email: str,
        username: str,
        hashed_password: str,
        role: str = "user",
        embedding: list[float] | None = None,
        preferences: dict[str, Any] | None = None,
    ) -> UserModel:
        from app.engine.scoring.semantic_learning import SemanticLearningEngine
        from app.schemas.user import get_default_user_preferences

        default_emb = SemanticLearningEngine.get_neutral_768d_prior(768)
        user = UserModel(
            id=user_id,
            email=email,
            username=username,
            hashed_password=hashed_password,
            role=role,
            is_active=True,
            embedding=embedding
            if (embedding is not None and len(embedding) > 0)
            else default_emb,
            preferences=preferences
            if (preferences is not None and bool(preferences))
            else get_default_user_preferences(),
        )
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        logger.info(f"Created new user: {username} ({user_id}) with role: {role}")
        return user

    async def update_user_admin(
        self, user_id: str, updates: dict[str, Any]
    ) -> UserModel | None:
        user = await self.get_by_id(user_id)
        if not user:
            return None
        for key, val in updates.items():
            if hasattr(user, key) and val is not None:
                setattr(user, key, val)
        await self.session.commit()
        await self.session.refresh(user)
        return user

    async def delete_user(self, user_id: str) -> bool:
        user = await self.get_by_id(user_id)
        if not user:
            return False
        await self.session.delete(user)
        await self.session.commit()
        logger.info(f"Deleted user: {user_id}")
        return True

    async def get_embedding(self, user_id: str) -> list[float] | None:
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
    ) -> UserModel | None:
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
