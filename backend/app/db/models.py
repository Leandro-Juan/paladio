import enum

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    ARRAY,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import synonym

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

    # Core operational & financial fields (normalized 7-day vectors & scalars)
    open_time_mins_by_day = Column(
        ARRAY(Integer), default=lambda: [480] * 7, nullable=False
    )
    close_time_mins_by_day = Column(
        ARRAY(Integer), default=lambda: [1320] * 7, nullable=False
    )
    duration_mins = Column(Integer, default=60, nullable=False)
    cost_eur = Column(Float, default=0.0, nullable=False)
    cost_is_estimated = Column(Boolean, default=True, nullable=False)
    cost_source = Column(String, nullable=True)
    osm_opening_hours = Column(String, nullable=True)

    # Relational JSONB fields
    location = Column(JSONB, nullable=False)
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
    embedding = Column(Vector(768), nullable=True)

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
    osm_status = Column(String, default="PENDING", nullable=False)
    gtfs_status = Column(String, default="PENDING", nullable=False)
    valid_until = Column(DateTime(timezone=True), nullable=True)
    gtfs_feed_name = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), onupdate=func.now(), server_default=func.now()
    )


class CityTransitFareModel(Base):
    __tablename__ = "city_transit_fares"

    city_name = Column("city", String, primary_key=True, index=True)
    country = Column(String, nullable=True)
    currency = Column(String, default="EUR", nullable=False)
    agency_name = Column(String, nullable=True)
    single_fare_eur = Column("single_fare", Float, nullable=False, default=2.0)
    day_pass_fare_eur = Column("pass_24h_price", Float, nullable=True)
    day_pass_name = Column("pass_24h_name", String, nullable=True)
    pass_24h_includes_airport = Column(Boolean, default=False, nullable=False)
    airport_surcharge_eur = Column(
        "airport_surcharge", Float, default=0.0, nullable=False
    )
    airport_station_keywords = Column(JSONB, default=list, nullable=False)
    source = Column("source", String, nullable=True)
    is_estimated = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), onupdate=func.now(), server_default=func.now()
    )

    # Property getters, setters and synonyms for backward compatibility
    @property
    def city(self) -> str:
        return self.city_name

    @city.setter
    def city(self, val: str):
        self.city_name = val

    city = synonym("city_name", descriptor=property(city.fget, city.fset))

    @property
    def single_fare(self) -> float:
        return self.single_fare_eur

    @single_fare.setter
    def single_fare(self, val: float):
        self.single_fare_eur = val

    single_fare = synonym(
        "single_fare_eur", descriptor=property(single_fare.fget, single_fare.fset)
    )

    @property
    def pass_24h_price(self) -> float | None:
        return self.day_pass_fare_eur

    @pass_24h_price.setter
    def pass_24h_price(self, val: float | None):
        self.day_pass_fare_eur = val

    pass_24h_price = synonym(
        "day_pass_fare_eur",
        descriptor=property(pass_24h_price.fget, pass_24h_price.fset),
    )

    @property
    def pass_24h_name(self) -> str | None:
        return self.day_pass_name

    @pass_24h_name.setter
    def pass_24h_name(self, val: str | None):
        self.day_pass_name = val

    pass_24h_name = synonym(
        "day_pass_name", descriptor=property(pass_24h_name.fget, pass_24h_name.fset)
    )

    @property
    def airport_surcharge(self) -> float:
        return self.airport_surcharge_eur

    @airport_surcharge.setter
    def airport_surcharge(self, val: float):
        self.airport_surcharge_eur = val

    airport_surcharge = synonym(
        "airport_surcharge_eur",
        descriptor=property(airport_surcharge.fget, airport_surcharge.fset),
    )

    @property
    def source_url(self) -> str | None:
        return self.source

    @source_url.setter
    def source_url(self, val: str | None):
        self.source = val

    source_url = synonym(
        "source", descriptor=property(source_url.fget, source_url.fset)
    )
