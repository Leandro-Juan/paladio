from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator, model_validator


TicketType = Literal["flight", "hotel", "attraction", "transit", "other"]
TicketStatus = Literal["planned", "confirmed", "used", "cancelled"]
TicketVisibility = Literal["trip", "private"]
TicketSource = Literal["itinerary", "manual", "scan", "import"]
BarcodeFormat = Literal["qr", "aztec", "pdf417", "code128", "datamatrix"]


class FlightMetadata(BaseModel):
    airline_code: str | None = None
    airline_name: str | None = None
    flight_number: str | None = None
    origin_iata: str | None = None
    destination_iata: str | None = None
    origin_city: str | None = None
    destination_city: str | None = None
    terminal: str | None = None
    gate: str | None = None
    boarding_time: str | None = None
    cabin_class: str | None = None
    sequence_number: str | None = None
    passenger_count: int | None = None
    checkin_url: str | None = None


class HotelMetadata(BaseModel):
    address: str | None = None
    room_type: str | None = None
    checkin_time: str | None = None
    checkout_time: str | None = None
    nights: int | None = None
    wifi_ssid: str | None = None
    wifi_password: str | None = None
    phone: str | None = None
    confirmation_url: str | None = None


class AttractionMetadata(BaseModel):
    venue: str | None = None
    address: str | None = None
    entry_slot_start: str | None = None
    entry_slot_end: str | None = None
    ticket_kind: str | None = None
    quantity: int | None = None
    language: str | None = None


class TransitMetadata(BaseModel):
    operator: str | None = None
    train_or_line_number: str | None = None
    origin_station: str | None = None
    destination_station: str | None = None
    coach: str | None = None
    platform: str | None = None
    pass_validity: str | None = None


def validate_type_metadata(
    ticket_type: str, metadata: dict[str, Any] | None
) -> dict[str, Any]:
    if not metadata:
        return {}
    if ticket_type == "flight":
        return FlightMetadata(**metadata).model_dump(exclude_unset=True)
    elif ticket_type == "hotel":
        return HotelMetadata(**metadata).model_dump(exclude_unset=True)
    elif ticket_type == "attraction":
        return AttractionMetadata(**metadata).model_dump(exclude_unset=True)
    elif ticket_type == "transit":
        return TransitMetadata(**metadata).model_dump(exclude_unset=True)
    return metadata


class TripTicketAttachmentResponse(BaseModel):
    id: str
    ticket_id: str
    filename: str
    mime_type: str
    size_bytes: int
    sha256: str
    created_at: str


class TripTicketBase(BaseModel):
    ticket_type: TicketType = "other"
    title: str = Field(..., max_length=200)
    provider: str | None = Field(None, max_length=200)
    reference_code: str | None = Field(None, max_length=64)
    holder_name: str | None = Field(None, max_length=200)
    start_time: datetime | None = None
    end_time: datetime | None = None
    start_tz: str | None = Field(None, max_length=64)
    end_tz: str | None = Field(None, max_length=64)
    seat_or_room: str | None = Field(None, max_length=64)
    location_or_venue: str | None = Field(None, max_length=300)
    price: Decimal | None = None
    currency: str | None = Field("EUR", max_length=3)
    status: TicketStatus = "planned"
    access_code: str | None = None
    barcode_value: str | None = None
    barcode_format: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None
    source: TicketSource = "manual"
    source_ref: str | None = None
    visibility: TicketVisibility = "trip"
    holder_user_id: str | None = None
    pinned: bool = False

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, v: str | None) -> str | None:
        if v:
            v_clean = v.strip().upper()
            if len(v_clean) != 3:
                raise ValueError("Currency must be a 3-letter ISO code.")
            return v_clean
        return "EUR"

    @model_validator(mode="after")
    def validate_times_and_metadata(self) -> "TripTicketBase":
        if self.start_time and self.end_time and self.end_time < self.start_time:
            raise ValueError("end_time must be greater than or equal to start_time")
        try:
            self.metadata = validate_type_metadata(self.ticket_type, self.metadata)
        except Exception as e:
            raise ValueError(f"Invalid metadata for {self.ticket_type}: {e}") from e
        return self


class TripTicketCreate(TripTicketBase):
    upload_id: str | None = None


class TripTicketUpdate(BaseModel):
    ticket_type: TicketType | None = None
    title: str | None = Field(None, max_length=200)
    provider: str | None = Field(None, max_length=200)
    reference_code: str | None = Field(None, max_length=64)
    holder_name: str | None = Field(None, max_length=200)
    start_time: datetime | None = None
    end_time: datetime | None = None
    start_tz: str | None = Field(None, max_length=64)
    end_tz: str | None = Field(None, max_length=64)
    seat_or_room: str | None = Field(None, max_length=64)
    location_or_venue: str | None = Field(None, max_length=300)
    price: Decimal | None = None
    currency: str | None = Field(None, max_length=3)
    status: TicketStatus | None = None
    access_code: str | None = None
    barcode_value: str | None = None
    barcode_format: str | None = None
    metadata: dict[str, Any] | None = None
    notes: str | None = None
    visibility: TicketVisibility | None = None
    holder_user_id: str | None = None
    pinned: bool | None = None

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, v: str | None) -> str | None:
        if v:
            v_clean = v.strip().upper()
            if len(v_clean) != 3:
                raise ValueError("Currency must be a 3-letter ISO code.")
            return v_clean
        return None

    @model_validator(mode="after")
    def validate_times(self) -> "TripTicketUpdate":
        if self.start_time and self.end_time and self.end_time < self.start_time:
            raise ValueError("end_time must be greater than or equal to start_time")
        return self


class TripTicketResponse(BaseModel):
    id: str
    trip_id: str
    ticket_type: TicketType
    title: str
    provider: str | None = None
    reference_code: str | None = None
    holder_name: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    start_tz: str | None = None
    end_tz: str | None = None
    seat_or_room: str | None = None
    location_or_venue: str | None = None
    price: float | None = None
    currency: str | None = "EUR"
    status: TicketStatus
    access_code: str | None = None
    barcode_value: str | None = None
    barcode_format: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None
    source: str
    source_ref: str | None = None
    user_modified: bool = False
    visibility: TicketVisibility = "trip"
    holder_user_id: str | None = None
    created_by: str | None = None
    pinned: bool = False
    drift: bool = False
    created_at: str
    updated_at: str
    attachments: list[TripTicketAttachmentResponse] = Field(default_factory=list)


class AttractionSuggestion(BaseModel):
    poi_id: str
    name: str
    category: str
    city: str
    cost_eur: float = 0.0
    day: int | None = None
    suggested_time: str | None = None


class TripTicketsListResponse(BaseModel):
    tickets: list[TripTicketResponse]
    suggestions: list[AttractionSuggestion] = Field(default_factory=list)
    has_drift: bool = False


class ScanDraft(BaseModel):
    ticket_type: TicketType
    title: str
    provider: str | None = None
    reference_code: str | None = None
    holder_name: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    start_tz: str | None = None
    end_tz: str | None = None
    seat_or_room: str | None = None
    location_or_venue: str | None = None
    price: float | None = None
    currency: str | None = "EUR"
    status: TicketStatus = "confirmed"
    access_code: str | None = None
    barcode_value: str | None = None
    barcode_format: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None
    field_confidence: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class ScanResponse(BaseModel):
    drafts: list[ScanDraft]
    upload_id: str | None = None
    raw_text_excerpt: str | None = None
