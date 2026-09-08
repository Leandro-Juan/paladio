import logging
from typing import Optional

from app.db.models import UserModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class SqlUserRepository:
    """
    SQLAlchemy repository for User embeddings.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_embedding(self, user_id: str) -> Optional[list[float]]:
        stmt = select(UserModel).where(UserModel.id == user_id)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()

        if model:
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
