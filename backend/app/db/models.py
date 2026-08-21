from sqlalchemy import Column, String, DateTime, func, Index
from sqlalchemy.dialects.postgresql import JSONB
from app.db.session import Base
from datetime import datetime, timezone

class AttractionModel(Base):
    __tablename__ = "attractions"

    # Core relational fields for fast querying
    id = Column(String, primary_key=True, index=True)
    city = Column(String, index=True, nullable=False)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    
    # Flexible JSONB fields for deep nesting and schema evolution
    location = Column(JSONB, nullable=False)
    schedule = Column(JSONB, nullable=False)
    financials = Column(JSONB, nullable=False)
    scoring = Column(JSONB, nullable=False)
    metadata_field = Column("metadata", JSONB, nullable=False) # 'metadata' is a reserved attribute on Base
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

    # Compound index for common query pattern
    __table_args__ = (
        Index('idx_city_category', 'city', 'category'),
    )
