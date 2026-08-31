import logging

from app.db.models import UserModel
from app.db.session import async_session
from sqlalchemy import select
from typing import Optional

logger = logging.getLogger(__name__)


class SqlUserRepository:
    """
    SQLAlchemy repository for User embeddings.
    """

    async def get_embedding(self, user_id: str) -> Optional[list[float]]:
        async with async_session() as session:
            stmt = select(UserModel).where(UserModel.id == user_id)
            result = await session.execute(stmt)
            model = result.scalar_one_or_none()

            if model:
                return model.embedding
            return None

    async def save_embedding(self, user_id: str, embedding: list[float]) -> None:
        async with async_session() as session:
            # Check if exists
            stmt = select(UserModel).where(UserModel.id == user_id)
            result = await session.execute(stmt)
            model = result.scalar_one_or_none()

            if model:
                model.embedding = embedding
            else:
                model = UserModel(id=user_id, embedding=embedding)
                session.add(model)

            await session.commit()
            logger.info(f"Saved ML embedding for user {user_id}.")
