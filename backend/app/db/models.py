import enum

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB

from app.db.session import Base


class AttractionModel(Base):
    __tablename__ = "attractions"

    # Core relational fields for fast querying
    id = Column(String, primary_key=True, index=True)
    city = Column(String, index=True, nullable=False)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)

    # 768D semantic embedding for pgvector cosine retrieval
    embedding = Column(Vector(768), nullable=True)

    # Flexible JSONB fields for deep nesting and schema evolution
    location = Column(JSONB, nullable=False)
    schedule = Column(JSONB, nullable=False)
    financials = Column(JSONB, nullable=False)
    scoring = Column(JSONB, nullable=False)
    metadata_field = Column(
        "metadata", JSONB, nullable=False
    )  # 'metadata' is a reserved attribute on Base

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), onupdate=func.now(), server_default=func.now()
    )

    # Compound index for common query pattern
    __table_args__ = (Index("idx_city_category", "city", "category"),)


class UserModel(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=True)
    username = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String, nullable=True)
    role = Column(String, default="user", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # Store the 768D semantic vector representing user preferences
    embedding = Column(JSONB, nullable=True)

    # Structured preferences (e.g. pace, budget, categories)
    preferences = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), onupdate=func.now(), server_default=func.now()
    )


class TripModel(Base):
    __tablename__ = "trips"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    destination = Column(String, nullable=False)
    start_date = Column(String, nullable=False)
    end_date = Column(String, nullable=False)
    itinerary_data = Column(JSONB, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), onupdate=func.now(), server_default=func.now()
    )


class TransitCacheStatus(str, enum.Enum):
    BUILDING = "BUILDING"
    READY = "READY"
    FAILED = "FAILED"


class TransitCacheModel(Base):
    __tablename__ = "transit_cache"

    city = Column(String, primary_key=True, index=True)
    status = Column(String, default=TransitCacheStatus.BUILDING.value, nullable=False)
    valid_until = Column(DateTime(timezone=True), nullable=True)
    gtfs_feed_name = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), onupdate=func.now(), server_default=func.now()
    )
