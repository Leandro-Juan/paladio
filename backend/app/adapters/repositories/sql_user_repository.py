from contextlib import asynccontextmanager
import logging
from typing import Any

from app.db.models import UserModel
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

ALLOWED_USER_ADMIN_UPDATE_FIELDS = frozenset(
    {"name", "bio", "preferences", "role", "is_active", "email", "username"}
)


class SqlUserRepository:
    """
    SQLAlchemy repository for Users and their ML embeddings.
    Supports either an injected persistent AsyncSession or short-lived
    scoped sessions via a session factory to prevent connection pool starvation.
    """

    def __init__(
        self,
        session: AsyncSession | None = None,
        session_factory: Any | None = None,
    ):
        self._session = session
        self._session_factory = session_factory

    @property
    def session(self) -> AsyncSession | None:
        return self._session

    @asynccontextmanager
    async def _get_session(self):
        if self._session is not None:
            yield self._session
        else:
            factory = self._session_factory
            if factory is None:
                from app.db.session import async_session

                factory = async_session
            async with factory() as sess:
                yield sess

    async def get_by_id(self, user_id: str) -> UserModel | None:
        stmt = select(UserModel).where(UserModel.id == user_id)
        async with self._get_session() as session:
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> UserModel | None:
        stmt = select(UserModel).where(UserModel.email == email)
        async with self._get_session() as session:
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def get_by_username(self, username: str) -> UserModel | None:
        stmt = select(UserModel).where(UserModel.username == username)
        async with self._get_session() as session:
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def get_by_username_or_email(self, identifier: str) -> UserModel | None:
        stmt = select(UserModel).where(
            or_(UserModel.username == identifier, UserModel.email == identifier)
        )
        async with self._get_session() as session:
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def count_users(self) -> int:
        from sqlalchemy import func

        stmt = select(func.count(UserModel.id)).where(
            UserModel.username.isnot(None), UserModel.hashed_password.isnot(None)
        )
        async with self._get_session() as session:
            result = await session.execute(stmt)
            return result.scalar() or 0

    async def list_users(self, limit: int = 50, offset: int = 0) -> list[UserModel]:
        stmt = (
            select(UserModel)
            .where(UserModel.username.isnot(None))
            .order_by(UserModel.created_at.asc())
            .offset(offset)
            .limit(limit)
        )
        async with self._get_session() as session:
            result = await session.execute(stmt)
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
            if (embedding is not None and len(embedding) == 768)
            else default_emb,
            preferences=preferences
            if (preferences is not None and bool(preferences))
            else get_default_user_preferences(),
        )
        async with self._get_session() as session:
            session.add(user)
            await session.commit()
            await session.refresh(user)
            logger.info(f"Created new user: {username} ({user_id}) with role: {role}")
            return user

    async def update_user_admin(
        self, user_id: str, updates: dict[str, Any]
    ) -> UserModel | None:
        async with self._get_session() as session:
            stmt = select(UserModel).where(UserModel.id == user_id)
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()
            if not user:
                return None
            for key, val in updates.items():
                if (
                    key in ALLOWED_USER_ADMIN_UPDATE_FIELDS
                    and hasattr(user, key)
                    and val is not None
                ):
                    setattr(user, key, val)
            await session.commit()
            await session.refresh(user)
            return user

    async def delete_user(self, user_id: str) -> bool:
        async with self._get_session() as session:
            stmt = select(UserModel).where(UserModel.id == user_id)
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()
            if not user:
                return False
            await session.delete(user)
            await session.commit()
            logger.info(f"Deleted user: {user_id}")
            return True

    async def get_embedding(self, user_id: str) -> list[float] | None:
        stmt = select(UserModel).where(UserModel.id == user_id)
        async with self._get_session() as session:
            result = await session.execute(stmt)
            model = result.scalar_one_or_none()

            if model and model.embedding is not None:
                return model.embedding
            return None

    async def save_embedding(self, user_id: str, embedding: list[float]) -> None:
        if embedding is None or len(embedding) != 768:
            raise ValueError(
                f"Expected 768D embedding vector, got {len(embedding) if embedding is not None else 'None'}D"
            )

        async with self._get_session() as session:
            stmt = select(UserModel).where(UserModel.id == user_id)
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()
            if user:
                user.embedding = embedding
            else:
                stmt_ins = insert(UserModel).values(id=user_id, embedding=embedding)
                stmt_ins = stmt_ins.on_conflict_do_update(
                    index_elements=["id"],
                    set_={"embedding": stmt_ins.excluded.embedding},
                )
                await session.execute(stmt_ins)
            await session.commit()
            logger.info(f"Saved ML embedding for user {user_id}.")

    async def update_preferences(
        self, user_id: str, preferences: dict[str, Any]
    ) -> UserModel | None:
        async with self._get_session() as session:
            stmt = select(UserModel).where(UserModel.id == user_id)
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()
            if not user:
                stmt_ins = insert(UserModel).values(id=user_id, preferences=preferences)
                stmt_ins = stmt_ins.on_conflict_do_update(
                    index_elements=["id"],
                    set_={"preferences": stmt_ins.excluded.preferences},
                )
                await session.execute(stmt_ins)
                await session.commit()
                stmt_sel = select(UserModel).where(UserModel.id == user_id)
                res_sel = await session.execute(stmt_sel)
                return res_sel.scalar_one_or_none()

            user.preferences = preferences
            await session.commit()
            await session.refresh(user)
            return user
