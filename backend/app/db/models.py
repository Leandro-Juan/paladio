import enum

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship, synonym

from app.db.session import Base


class CityModel(Base):
    __tablename__ = "cities"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    aliases = Column(ARRAY(String), default=list, nullable=False)
    country_code = Column(String(2), nullable=False, index=True)
    center_lat = Column(Float, nullable=False)
    center_lon = Column(Float, nullable=False)
    bbox = Column(ARRAY(Float), nullable=False)  # [south, west, north, east]
    radius_km = Column(Float, default=15.0, nullable=False)
    timezone = Column(String, default="UTC", nullable=False)
    currency = Column(String(3), default="EUR", nullable=False)
    profile = Column(JSONB, default=dict, nullable=False)
    ingested_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), onupdate=func.now(), server_default=func.now()
    )

    attractions = relationship(
        "AttractionModel",
        back_populates="city_rel",
        foreign_keys="[AttractionModel.city_id]",
    )


class AttractionModel(Base):
    __tablename__ = "attractions"

    # Core relational fields for fast querying
    id = Column(String, primary_key=True, index=True)
    city = Column(String, index=True, nullable=False)
    city_id = Column(
        String, ForeignKey("cities.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)

    city_rel = relationship(
        "CityModel", back_populates="attractions", foreign_keys=[city_id]
    )

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
    admission_fee = synonym("cost_eur")
    cost_is_estimated = Column(Boolean, default=True, nullable=False)
    cost_source = Column(String, nullable=True)
    osm_opening_hours = Column(String, nullable=True)
    opening_hours_raw = synonym("osm_opening_hours")

    # Itinerary v2 tiering and taxonomy fields
    tier = Column(Integer, default=3, server_default="3", nullable=False)
    tier_confidence = Column(
        String, default="low", server_default="low", nullable=False
    )
    tier_source = Column(
        String, default="heuristic", server_default="heuristic", nullable=False
    )
    iconicity_score = Column(Float, default=0.0, server_default="0.0", nullable=False)
    taxonomy_category = Column(
        String, default="art_culture", server_default="art_culture", nullable=False
    )
    category_id = Column(Integer, default=0, server_default="0", nullable=False)
    visit_mode = Column(String, default="full", server_default="full", nullable=False)

    # Relational JSONB fields
    location = Column(JSONB, nullable=False)
    scoring = Column(JSONB, nullable=False)
    metadata_field = Column(
        "metadata", JSONB, nullable=False
    )  # 'metadata' is a reserved attribute on Base

    # Multi-source enrichment & rich document attributes
    aliases = Column(ARRAY(String), default=list, nullable=False)
    neighborhood = Column(String, index=True, nullable=True)
    wikidata_id = Column(String(32), index=True, nullable=True)
    wikipedia_title = Column(String, nullable=True)
    website = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    description_source = Column(String(32), nullable=True)
    doc_quality = Column(String(1), server_default="C", default="C", index=True)
    facets = Column(JSONB, default=dict, nullable=False)
    sitelinks_count = Column(Integer, default=0, nullable=False)
    pageviews_30d = Column(Integer, default=0, nullable=False)
    hours_known = Column(Boolean, default=False, nullable=False)
    daily_windows = Column(JSONB, default=list, nullable=False)
    has_split_hours = Column(Boolean, default=False, nullable=False)
    embedding_text = Column(Text, nullable=True)
    embedding_text_hash = Column(String(64), index=True, nullable=True)
    embedding_model = Column(String(64), nullable=True)
    embedding_version = Column(Integer, default=0, nullable=False)
    embedded_at = Column(DateTime(timezone=True), nullable=True)
    provenance = Column(JSONB, default=dict, nullable=False)
    hydration_status = Column(
        String(16), default="RAW", server_default="RAW", index=True
    )

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), onupdate=func.now(), server_default=func.now()
    )

    # Compound indices for common query patterns
    __table_args__ = (
        Index("idx_city_category", "city", "category"),
        Index("ix_attractions_city_tier", "city", "tier"),
        Index("ix_attractions_name", "name"),
        Index("ix_attractions_wikidata_id", "wikidata_id"),
        Index("ix_attractions_neighborhood", "neighborhood"),
        Index("ix_attractions_doc_quality", "doc_quality"),
        Index("ix_attractions_hydration_status", "hydration_status"),
        Index("ix_attractions_embedding_text_hash", "embedding_text_hash"),
    )


class PoiPriceCatalogModel(Base):
    __tablename__ = "poi_price_catalog"

    id = Column(String, primary_key=True, index=True)
    city_id = Column(
        String, ForeignKey("cities.id", ondelete="CASCADE"), nullable=True, index=True
    )
    normalized_name = Column(String, nullable=False, index=True)
    wikidata_id = Column(String(32), nullable=True, index=True)
    price_eur = Column(Float, nullable=False, default=0.0)
    is_free = Column(Boolean, nullable=False, default=False)
    source_url = Column(String, nullable=True)
    verified_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_poi_price_catalog_city_name", "city_id", "normalized_name"),
    )


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
    status = Column(String, default="active", nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), onupdate=func.now(), server_default=func.now()
    )

    participants = relationship(
        "TripParticipantModel",
        back_populates="trip",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    expenses = relationship(
        "TripExpenseModel",
        back_populates="trip",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    tickets = relationship(
        "TripTicketModel",
        back_populates="trip",
        cascade="all, delete-orphan",
        lazy="select",
    )


class TripParticipantModel(Base):
    __tablename__ = "trip_participants"

    id = Column(String, primary_key=True, index=True)
    trip_id = Column(
        String, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id = Column(
        String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    role = Column(String, default="traveler", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    trip = relationship("TripModel", back_populates="participants")
    user = relationship("UserModel")


class TripExpenseModel(Base):
    __tablename__ = "trip_expenses"

    id = Column(String, primary_key=True, index=True)
    trip_id = Column(
        String, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    payer_id = Column(
        String,
        ForeignKey("trip_participants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    description = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String, default="EUR", nullable=False)
    category = Column(String, default="other", nullable=False)
    split_type = Column(String, default="equal", nullable=False)
    splits = Column(JSONB, default=list, nullable=False)
    expense_date = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), onupdate=func.now(), server_default=func.now()
    )

    trip = relationship("TripModel", back_populates="expenses")
    payer = relationship("TripParticipantModel")


class TransitCacheStatus(str, enum.Enum):
    PENDING = "PENDING"
    QUEUED = "QUEUED"
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


class PoiTravelCacheModel(Base):
    __tablename__ = "poi_travel_cache"

    origin_id = Column(
        String, ForeignKey("attractions.id", ondelete="CASCADE"), primary_key=True
    )
    destination_id = Column(
        String, ForeignKey("attractions.id", ondelete="CASCADE"), primary_key=True
    )
    mode = Column(String, primary_key=True, default="transit", server_default="transit")
    duration_mins = Column(Float, nullable=False)
    cost_eur = Column(Float, nullable=False, default=0.0, server_default="0.0")
    distance_km = Column(Float, nullable=False, default=0.0, server_default="0.0")
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("idx_poi_travel_cache_pair", "origin_id", "destination_id"),
    )


class TripTicketModel(Base):
    __tablename__ = "trip_tickets"

    id = Column(String, primary_key=True, index=True)
    trip_id = Column(
        String, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ticket_type = Column(String, nullable=False)
    title = Column(String(200), nullable=False)
    provider = Column(String(200), nullable=True)
    reference_code = Column(String(64), nullable=True)
    holder_name = Column(String(200), nullable=True)
    start_time = Column(DateTime(timezone=True), nullable=True)
    end_time = Column(DateTime(timezone=True), nullable=True)
    start_tz = Column(String(64), nullable=True)
    end_tz = Column(String(64), nullable=True)
    seat_or_room = Column(String(64), nullable=True)
    location_or_venue = Column(String(300), nullable=True)
    price = Column(Numeric(12, 2), nullable=True)
    currency = Column(String(3), nullable=True, default="EUR")
    status = Column(String, nullable=False, default="planned")
    access_code = Column(Text, nullable=True)
    barcode_value = Column(Text, nullable=True)
    barcode_format = Column(String, nullable=True)
    ticket_metadata = Column("metadata", JSONB, default=dict, nullable=False)
    notes = Column(Text, nullable=True)
    source = Column(String, nullable=False, default="manual")
    source_ref = Column(String, nullable=True)
    user_modified = Column(Boolean, nullable=False, default=False)
    visibility = Column(String, nullable=False, default="trip")
    holder_user_id = Column(
        String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by = Column(
        String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    pinned = Column(Boolean, nullable=False, default=False)

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        onupdate=func.now(),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        Index("idx_trip_tickets_trip_start", "trip_id", "start_time"),
        Index(
            "idx_trip_tickets_itinerary_unique",
            "trip_id",
            "source",
            "source_ref",
            unique=True,
            postgresql_where=Column("source") == "itinerary",
        ),
        CheckConstraint(
            "ticket_type IN ('flight', 'hotel', 'attraction', 'transit', 'other')",
            name="check_trip_ticket_type",
        ),
        CheckConstraint(
            "status IN ('planned', 'confirmed', 'used', 'cancelled')",
            name="check_trip_ticket_status",
        ),
        CheckConstraint(
            "end_time IS NULL OR end_time >= start_time",
            name="check_trip_ticket_time_range",
        ),
    )

    trip = relationship("TripModel", back_populates="tickets")
    attachments = relationship(
        "TripTicketAttachmentModel",
        back_populates="ticket",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    holder_user = relationship("UserModel", foreign_keys=[holder_user_id])
    creator = relationship("UserModel", foreign_keys=[created_by])


class TripTicketAttachmentModel(Base):
    __tablename__ = "trip_ticket_attachments"

    id = Column(String, primary_key=True, index=True)
    ticket_id = Column(
        String,
        ForeignKey("trip_tickets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    filename = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    sha256 = Column(String(64), nullable=False)
    storage_path = Column(String, nullable=False)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    ticket = relationship("TripTicketModel", back_populates="attachments")


# ==============================================================================
# Paladio Deal Engine Storage Layer Models (Phase 1)
# ==============================================================================


class MarketPriceTickModel(Base):
    """
    Raw ingested price observation for flights or lodging.
    Backed by a TimescaleDB hypertable partitioned on observed_at.
    """

    __tablename__ = "market_price_ticks"

    id = Column(String, primary_key=True)
    observed_at = Column(DateTime(timezone=True), primary_key=True, nullable=False)
    asset_type = Column(String, nullable=False)  # 'flight' | 'lodging'
    origin_iata = Column(String(3), nullable=True)
    destination_code = Column(String, nullable=False, index=True)
    dest_airport_iata = Column(String(3), nullable=True)
    depart_date = Column(Date, nullable=False)
    return_date = Column(Date, nullable=False)
    nights = Column(Integer, nullable=False)
    lead_time_days = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False, default="EUR")
    base_price_cents = Column(BigInteger, nullable=False)
    landed_price_cents = Column(BigInteger, nullable=True)
    stat = Column(String, nullable=False, default="single")
    sample_n = Column(Integer, nullable=True)
    quality_tier = Column(String, nullable=True)
    source = Column(String, nullable=False)
    source_class = Column(String, nullable=False, default="cache")
    is_aggregated = Column(Boolean, nullable=False, default=False)
    source_observed_at = Column(DateTime(timezone=True), nullable=True)
    content_hash = Column(LargeBinary, nullable=False)
    ingest_run_id = Column(String, nullable=True)
    is_exploration = Column(Boolean, nullable=False, default=False)
    metadata_json = Column(JSONB, nullable=True)

    __table_args__ = (
        Index(
            "ix_ticks_route_date_desc",
            "asset_type",
            "origin_iata",
            "destination_code",
            "depart_date",
            observed_at.desc(),
        ),
        Index(
            "uq_ticks_content_hash_obs",
            "content_hash",
            "observed_at",
            unique=True,
        ),
    )


class PriceDailyModel(Base):
    """
    Rollup of daily minimum base prices per itinerary.
    Unit of observation for route statistical baselines.
    """

    __tablename__ = "price_daily"

    bucket = Column(Date, primary_key=True)
    asset_type = Column(String, primary_key=True)
    origin_iata = Column(String(3), primary_key=True, default="")
    destination_code = Column(String, primary_key=True)
    depart_date = Column(Date, primary_key=True)
    nights = Column(Integer, primary_key=True)
    source_class = Column(String, primary_key=True)
    source = Column(String, primary_key=True)
    currency = Column(String(3), primary_key=True, default="EUR")
    min_base = Column(BigInteger, nullable=False)
    n_ticks = Column(Integer, nullable=False)


class RouteBaselineModel(Base):
    """
    Statistical distribution baselines (quantiles) computed by nightly SQL rollup.
    """

    __tablename__ = "route_baselines"

    asset_type = Column(String, primary_key=True)
    origin_iata = Column(String(3), primary_key=True, default="")
    destination_code = Column(String, primary_key=True)
    depart_month = Column(Integer, primary_key=True, default=0)
    lead_bucket = Column(String, primary_key=True, default="all")
    source_class = Column(String, primary_key=True)
    currency = Column(String(3), primary_key=True, default="EUR")
    level = Column(String, primary_key=True)  # 'full', 'drop_lead', 'drop_month'
    n_rows = Column(Integer, nullable=False)
    n_obs_days = Column(Integer, nullable=False)
    n_depart_dates = Column(Integer, nullable=False)
    q02 = Column(BigInteger, nullable=False)
    q05 = Column(BigInteger, nullable=False)
    q10 = Column(BigInteger, nullable=False)
    q25 = Column(BigInteger, nullable=False)
    q50 = Column(BigInteger, nullable=False)
    q75 = Column(BigInteger, nullable=False)
    window_start = Column(Date, nullable=False)
    window_end = Column(Date, nullable=False)
    computed_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class FeeModel(Base):
    """Learned landed / base ratio from live verified ticks."""

    __tablename__ = "fee_models"

    asset_type = Column(String, primary_key=True)
    source = Column(String, primary_key=True)
    destination_code = Column(String, primary_key=True, default="ALL")
    ratio_p50 = Column(Numeric(5, 3), nullable=False)
    n = Column(Integer, nullable=False)
    computed_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class DestinationAirportModel(Base):
    """Maps destination cities to airport IATA codes."""

    __tablename__ = "destination_airports"

    city_id = Column(
        String, ForeignKey("cities.id", ondelete="CASCADE"), primary_key=True
    )
    iata = Column(String(3), primary_key=True)
    is_primary = Column(Boolean, default=True, nullable=False)


class DealWatchAlertModel(Base):
    """User proactive deal watch alert parameters."""

    __tablename__ = "deal_watch_alerts"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    origin_iata = Column(String(3), nullable=False)
    destinations = Column(ARRAY(String), nullable=False)
    earliest_date = Column(Date, nullable=False)
    latest_date = Column(Date, nullable=False)
    min_nights = Column(Integer, default=1, nullable=False)
    max_nights = Column(Integer, default=7, nullable=False)
    travelers = Column(Integer, default=1, nullable=False)
    bags_needed = Column(Integer, default=0, nullable=False)
    max_budget_cents = Column(BigInteger, nullable=False)
    currency = Column(String(3), default="EUR", nullable=False)
    max_package_ratio = Column(Numeric(4, 2), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), onupdate=func.now(), server_default=func.now()
    )
    last_scanned_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "earliest_date <= latest_date", name="ck_deal_watch_alerts_dates"
        ),
        CheckConstraint("min_nights <= max_nights", name="ck_deal_watch_alerts_nights"),
        CheckConstraint("max_budget_cents > 0", name="ck_deal_watch_alerts_budget"),
        CheckConstraint(
            "travelers >= 1 AND travelers <= 2", name="ck_deal_watch_alerts_travelers"
        ),
        Index("ix_deal_watch_alerts_gin_dest", "destinations", postgresql_using="gin"),
        Index(
            "ix_deal_watch_alerts_scan",
            "origin_iata",
            "is_active",
            "earliest_date",
            "latest_date",
        ),
    )


class DealCandidateModel(Base):
    """Candidate deal package identified by statistical detection."""

    __tablename__ = "deal_candidates"

    id = Column(String, primary_key=True, index=True)
    idempotency_key = Column(String, unique=True, nullable=False, index=True)
    asset_type = Column(String, default="package", nullable=False)
    origin_iata = Column(String(3), nullable=False)
    destination_code = Column(String, nullable=False)
    depart_date = Column(Date, nullable=False)
    return_date = Column(Date, nullable=False)
    currency = Column(String(3), default="EUR", nullable=False)
    cached_flight_base_cents = Column(BigInteger, nullable=False)
    lodging_estimate_cents = Column(BigInteger, nullable=False)
    est_total_cents = Column(BigInteger, nullable=False)
    est_savings_cents = Column(BigInteger, nullable=False)
    package_ratio = Column(Numeric(5, 3), nullable=False)
    baseline_level_used = Column(String, nullable=False)
    confidence = Column(String, default="medium", nullable=False)
    detector_version = Column(String, default="v3", nullable=False)
    status = Column(String, default="candidate", nullable=False)
    reject_reason = Column(String, nullable=True)
    live_queries_used = Column(Integer, default=0, nullable=False)
    live_cost_cents = Column(BigInteger, default=0, nullable=False)
    verification_json = Column(JSONB, nullable=True)
    is_exploration = Column(Boolean, default=False, nullable=False)
    detected_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    verified_at = Column(DateTime(timezone=True), nullable=True)


class DealEventModel(Base):
    """Event matching a deal candidate to an active user alert."""

    __tablename__ = "deal_events"

    id = Column(String, primary_key=True, index=True)
    candidate_id = Column(
        String, ForeignKey("deal_candidates.id", ondelete="CASCADE"), nullable=False
    )
    alert_id = Column(
        String, ForeignKey("deal_watch_alerts.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String, default="pending", nullable=False)
    package_json = Column(JSONB, nullable=False)
    alerted_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    user_feedback = Column(String, nullable=True)
    feedback_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index(
            "uq_deal_events_alert_candidate", "alert_id", "candidate_id", unique=True
        ),
        Index("ix_deal_events_status_alerted", "status", "alerted_at"),
    )
