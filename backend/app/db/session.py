import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

# The docker-compose provides postgresql+asyncpg://postgres:postgres@db:5432/paladio
# But if running locally outside docker, it might be localhost.
DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/paladio"
)

# Replace standard postgresql scheme with asyncpg if needed
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Create the async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
)

# Create the session factory
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()


# Dependency for FastAPI
async def get_db():
    async with async_session() as session:
        yield session
