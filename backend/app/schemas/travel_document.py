from typing import Any, Literal
from pydantic import BaseModel, Field

TravelDocumentType = Literal["flight", "hotel", "attraction", "transit", "other"]
TravelDocumentStatus = Literal["planned", "confirmed", "used", "cancelled"]
BarcodeFormat = Literal["qr", "aztec", "pdf417", "code128", "datamatrix"]


class TravelDocumentDraft(BaseModel):
    ticket_type: TravelDocumentType = Field(
        default="other", description="Type of travel document"
    )
    title: str = Field(
        ..., max_length=200, description="Title or summary of the travel document"
    )
    provider: str | None = Field(
        None, max_length=200, description="Airline, hotel, or transit provider"
    )
    reference_code: str | None = Field(
        None, max_length=64, description="PNR, booking ref, or locator code"
    )
    holder_name: str | None = Field(
        None, max_length=200, description="Passenger or guest name"
    )
    start_time: str | None = Field(
        None, description="ISO datetime of start or departure"
    )
    end_time: str | None = Field(None, description="ISO datetime of end or arrival")
    start_tz: str | None = Field(None, max_length=64)
    end_tz: str | None = Field(None, max_length=64)
    seat_or_room: str | None = Field(
        None, max_length=64, description="Seat assignment or room number"
    )
    location_or_venue: str | None = Field(None, max_length=300)
    price: float | None = None
    currency: str | None = "EUR"
    status: TravelDocumentStatus = "confirmed"
    access_code: str | None = None
    barcode_value: str | None = None
    barcode_format: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None
    field_confidence: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class TravelDocumentScanResponse(BaseModel):
    drafts: list[TravelDocumentDraft]
    upload_id: str | None = None
    raw_text_excerpt: str | None = None
