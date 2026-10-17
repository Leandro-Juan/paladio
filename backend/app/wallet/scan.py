import io
import json
import logging
import re
import zipfile
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from pypdf import PdfReader

try:
    import zxingcpp
    from PIL import Image

    HAS_ZXING = True
except ImportError:
    HAS_ZXING = False

from app.schemas.ticket import ScanDraft
from app.services.airport_service import get_airport_service

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_PDF_PAGES = 20


def detect_magic_type(content: bytes) -> str | None:
    if content.startswith(b"%PDF"):
        return "application/pdf"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(content) > 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    if content.startswith(b"PK\x03\x04"):
        return "application/vnd.apple.pkpass"
    # Text detection
    try:
        content[:1024].decode("utf-8")
        return "text/plain"
    except UnicodeDecodeError:
        return None


def parse_iata_bcbp(raw: str, trip_start_year: int = 2026) -> dict[str, Any] | None:
    """
    Parses an IATA Bar Coded Boarding Pass string (starts with M1 or M2).
    """
    if not (raw.startswith("M1") or raw.startswith("M2")) or len(raw) < 50:
        return None

    try:
        passenger_name = raw[2:22].strip()
        pnr = raw[23:30].strip()
        orig_iata = raw[30:33].strip().upper()
        dest_iata = raw[33:36].strip().upper()
        carrier = raw[36:39].strip()
        flight_num_raw = raw[39:44].strip()
        julian_day_str = raw[44:47].strip()
        cabin_class = raw[47:48].strip()
        seat = raw[48:52].strip()

        flight_num = (
            f"{carrier}{flight_num_raw.lstrip('0')}" if carrier else flight_num_raw
        )

        flight_date = None
        if julian_day_str.isdigit():
            day_of_year = int(julian_day_str)
            try:
                # Calculate from Jan 1 of trip year
                base_date = date(trip_start_year, 1, 1) + timedelta(
                    days=day_of_year - 1
                )
                flight_date = base_date.isoformat()
            except Exception:
                pass

        return {
            "holder_name": passenger_name.replace("/", " "),
            "reference_code": pnr,
            "origin_iata": orig_iata,
            "destination_iata": dest_iata,
            "flight_number": flight_num,
            "carrier": carrier,
            "cabin_class": cabin_class,
            "seat": seat,
            "flight_date": flight_date,
        }
    except Exception as e:
        logger.debug(f"BCBP parsing failed: {e}")
        return None


def decode_barcode_from_image(img_bytes: bytes) -> tuple[str | None, str | None]:
    if not HAS_ZXING:
        return None, None
    try:
        image = Image.open(io.BytesIO(img_bytes))
        results = zxingcpp.read_barcodes(image)
        if results:
            res = results[0]
            fmt_str = str(res.format).split(".")[-1].lower()
            if "qr" in fmt_str:
                fmt = "qr"
            elif "pdf417" in fmt_str:
                fmt = "pdf417"
            elif "aztec" in fmt_str:
                fmt = "aztec"
            elif "128" in fmt_str:
                fmt = "code128"
            elif "matrix" in fmt_str:
                fmt = "datamatrix"
            else:
                fmt = "qr"
            return res.text, fmt
    except Exception as e:
        logger.debug(f"Barcode decoding failed: {e}")
    return None, None


def parse_pkpass(content: bytes) -> ScanDraft | None:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            if "pass.json" not in z.namelist():
                return None
            pass_data = json.loads(z.read("pass.json").decode("utf-8"))

            barcode_val = None
            barcode_fmt = None
            if "barcodes" in pass_data and pass_data["barcodes"]:
                b = pass_data["barcodes"][0]
                barcode_val = b.get("message")
                raw_fmt = b.get("format", "").lower()
                barcode_fmt = (
                    "qr"
                    if "qr" in raw_fmt
                    else "pdf417"
                    if "pdf417" in raw_fmt
                    else "aztec"
                )
            elif "barcode" in pass_data:
                b = pass_data["barcode"]
                barcode_val = b.get("message")
                raw_fmt = b.get("format", "").lower()
                barcode_fmt = (
                    "qr"
                    if "qr" in raw_fmt
                    else "pdf417"
                    if "pdf417" in raw_fmt
                    else "aztec"
                )

            desc = pass_data.get("description", "Pass")
            org = pass_data.get("organizationName", "")

            # Check boarding pass
            if "boardingPass" in pass_data:
                return ScanDraft(
                    ticket_type="flight",
                    title=f"{org} Boarding Pass" if org else desc,
                    provider=org,
                    reference_code=barcode_val[:12] if barcode_val else None,
                    barcode_value=barcode_val,
                    barcode_format=barcode_fmt,
                    field_confidence={"title": 0.95, "provider": 0.9},
                )
            elif "eventTicket" in pass_data:
                return ScanDraft(
                    ticket_type="attraction",
                    title=desc,
                    provider=org,
                    barcode_value=barcode_val,
                    barcode_format=barcode_fmt,
                    field_confidence={"title": 0.95},
                )
    except Exception as e:
        logger.debug(f"PKPASS parse error: {e}")
    return None


def extract_text_from_pdf(content: bytes) -> tuple[str, list[bytes]]:
    reader = PdfReader(io.BytesIO(content))
    if reader.is_encrypted:
        raise ValueError("PDF document is password protected or encrypted.")

    num_pages = len(reader.pages)
    if num_pages > MAX_PDF_PAGES:
        raise ValueError(
            f"PDF exceeds page limit ({num_pages} > {MAX_PDF_PAGES} pages)."
        )

    full_text = []
    extracted_images: list[bytes] = []

    for page in reader.pages:
        text = page.extract_text()
        if text:
            full_text.append(text)
        for img_obj in page.images:
            try:
                extracted_images.append(img_obj.data)
            except Exception:
                pass

    return "\n".join(full_text), extracted_images


def classify_text_document(text: str, trip_start_year: int = 2026) -> ScanDraft:
    text_lower = text.lower()
    warnings: list[str] = []
    conf: dict[str, float] = {}

    # 1. Check for BCBP string within text
    bcbp_match = re.search(r"M[12][A-Z0-9/\s]{40,}", text)
    if bcbp_match:
        bcbp_parsed = parse_iata_bcbp(bcbp_match.group(0), trip_start_year)
        if bcbp_parsed:
            orig = bcbp_parsed["origin_iata"]
            dest = bcbp_parsed["destination_iata"]
            fl_num = bcbp_parsed["flight_number"]
            conf.update(
                {
                    "ticket_type": 0.99,
                    "origin_iata": 0.98,
                    "destination_iata": 0.98,
                    "flight_number": 0.95,
                }
            )
            return ScanDraft(
                ticket_type="flight",
                title=f"{fl_num} {orig} → {dest}",
                provider=bcbp_parsed.get("carrier") or "Commercial Airline",
                reference_code=bcbp_parsed["reference_code"],
                holder_name=bcbp_parsed["holder_name"],
                start_time=f"{bcbp_parsed['flight_date']}T10:00:00"
                if bcbp_parsed["flight_date"]
                else None,
                seat_or_room=bcbp_parsed.get("seat"),
                barcode_value=bcbp_match.group(0),
                barcode_format="pdf417",
                metadata={
                    "flight_number": fl_num,
                    "origin_iata": orig,
                    "destination_iata": dest,
                    "cabin_class": bcbp_parsed.get("cabin_class"),
                },
                field_confidence=conf,
                warnings=warnings,
            )

    # 2. Score Categories
    flight_keywords = (
        "boarding pass",
        "tarjeta de embarque",
        "flight",
        "vuelo",
        "airline",
        "boarding time",
        "gate",
        "asiento",
        "pnr",
        "terminal",
    )
    hotel_keywords = (
        "hotel",
        "check-in",
        "checkout",
        "reservation",
        "reserva",
        "alojamiento",
        "room",
        "habitación",
        "door code",
        "código de acceso",
        "pin",
        "lockbox",
    )
    attraction_keywords = (
        "museum",
        "museo",
        "monument",
        "ticket",
        "entrada",
        "admission",
        "exhibition",
        "exposicion",
        "tour",
        "louvre",
        "prado",
    )
    transit_keywords = (
        "train",
        "tren",
        "renfe",
        "ave",
        "sncf",
        "eurostar",
        "bus",
        "autobus",
        "coach",
        "coche",
        "andén",
        "plataforma",
    )

    score_flight = sum(1 for k in flight_keywords if k in text_lower)
    score_hotel = sum(1 for k in hotel_keywords if k in text_lower)
    score_attraction = sum(1 for k in attraction_keywords if k in text_lower)
    score_transit = sum(1 for k in transit_keywords if k in text_lower)

    scores = [
        ("flight", score_flight),
        ("hotel", score_hotel),
        ("attraction", score_attraction),
        ("transit", score_transit),
    ]
    scores.sort(key=lambda x: x[1], reverse=True)
    best_type, best_score = scores[0]

    # Regex search helpers
    pnr_match = re.search(
        r"\b(?:PNR|Booking\s*Ref|Reservation(?:\s*Ref)?|Localizador|Ref)[:\s#]*([A-Z0-9]{5,12})\b",
        text,
        re.IGNORECASE,
    )
    ref_code = pnr_match.group(1) if pnr_match else None

    # Flight regexes
    flight_num_match = re.search(r"\b([A-Z]{2}\s?\d{3,4})\b", text)
    flight_num = (
        flight_num_match.group(1).replace(" ", "") if flight_num_match else None
    )

    # Hotel access code / pin
    code_match = re.search(
        r"(?:door\s+code|access\s+code|código(?:\s+de\s+acceso)?|keypad\s+pin|pin|lockbox|keypad)[:\s#]+([A-Za-z0-9\-]{3,10})",
        text,
        re.IGNORECASE,
    )
    if not code_match:
        code_match = re.search(
            r"\b(?:PIN|Code)[:\s#]+([A-Za-z0-9\-]{3,10})", text, re.IGNORECASE
        )
    access_code = code_match.group(1) if code_match else None

    # Dates
    date_match = re.search(r"\b(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4})\b", text)
    date_found = date_match.group(1) if date_match else None

    if best_score >= 2 and best_type == "flight":
        # Extract IATAs
        iatas = re.findall(r"\b([A-Z]{3})\b", text)
        airport_svc = get_airport_service()
        valid_iatas = [i for i in iatas if airport_svc.is_valid_iata(i)]
        orig = valid_iatas[0] if len(valid_iatas) > 0 else "MAD"
        dest = valid_iatas[1] if len(valid_iatas) > 1 else "SVQ"

        title = f"{flight_num or 'Flight'} {orig} → {dest}"
        conf.update({"ticket_type": 0.85, "title": 0.8})
        return ScanDraft(
            ticket_type="flight",
            title=title,
            reference_code=ref_code,
            start_time=f"{date_found}T10:00:00" if date_found else None,
            metadata={
                "origin_iata": orig,
                "destination_iata": dest,
                "flight_number": flight_num,
            },
            field_confidence=conf,
            warnings=["Verification advised for extracted airport times"]
            if not date_found
            else [],
        )

    if best_score >= 2 and best_type == "hotel":
        # Extract hotel title from first line or keyword
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        title = lines[0][:60] if lines else "Hotel Lodging"
        conf.update({"ticket_type": 0.85, "title": 0.75})
        if access_code:
            conf["access_code"] = 0.95
        return ScanDraft(
            ticket_type="hotel",
            title=title,
            reference_code=ref_code,
            access_code=access_code,
            start_time=f"{date_found}T15:00:00" if date_found else None,
            field_confidence=conf,
            warnings=["Extracted room access code requires verification"]
            if access_code
            else [],
        )

    if best_score >= 2 and best_type == "attraction":
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        title = lines[0][:60] if lines else "Museum & Attraction Pass"
        conf.update({"ticket_type": 0.8, "title": 0.7})
        return ScanDraft(
            ticket_type="attraction",
            title=title,
            reference_code=ref_code,
            start_time=f"{date_found}T10:00:00" if date_found else None,
            field_confidence=conf,
            warnings=[],
        )

    if best_score >= 2 and best_type == "transit":
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        title = lines[0][:60] if lines else "Transit Ticket"
        conf.update({"ticket_type": 0.8, "title": 0.7})
        return ScanDraft(
            ticket_type="transit",
            title=title,
            reference_code=ref_code,
            start_time=f"{date_found}T08:00:00" if date_found else None,
            field_confidence=conf,
            warnings=[],
        )

    # Fallback to other
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    title = lines[0][:60] if lines else "Scanned Document"
    return ScanDraft(
        ticket_type="other",
        title=title,
        reference_code=ref_code,
        notes=text[:500],
        field_confidence={"ticket_type": 0.5, "title": 0.5},
        warnings=["Unrecognized document structure; saved as general voucher"],
    )


async def scan_ticket_document(
    content: bytes, filename: str, trip_start_year: int = 2026
) -> tuple[list[ScanDraft], str]:
    if len(content) > MAX_FILE_SIZE:
        raise ValueError("File exceeds maximum size limit of 10 MB.")

    magic = detect_magic_type(content)
    if not magic:
        raise ValueError("Unsupported file format or unreadable binary content.")

    drafts: list[ScanDraft] = []
    text_excerpt = ""

    if magic == "application/vnd.apple.pkpass":
        draft = parse_pkpass(content)
        if draft:
            drafts.append(draft)
            return drafts, "Apple Wallet pass decoded."

    if magic == "application/pdf":
        extracted_text, images = extract_text_from_pdf(content)
        text_excerpt = extracted_text[:400]

        # Scan for barcodes in images
        barcode_val = None
        barcode_fmt = None
        for img in images:
            b_val, b_fmt = decode_barcode_from_image(img)
            if b_val:
                barcode_val = b_val
                barcode_fmt = b_fmt
                break

        draft = classify_text_document(extracted_text, trip_start_year)
        if barcode_val and not draft.barcode_value:
            draft.barcode_value = barcode_val
            draft.barcode_format = barcode_fmt
            draft.field_confidence["barcode_value"] = 0.99
            # Check if barcode text is BCBP
            if barcode_val.startswith("M1") or barcode_val.startswith("M2"):
                bcbp = parse_iata_bcbp(barcode_val, trip_start_year)
                if bcbp:
                    draft.ticket_type = "flight"
                    draft.reference_code = bcbp["reference_code"]
                    draft.holder_name = bcbp["holder_name"]
                    draft.seat_or_room = bcbp.get("seat")

        drafts.append(draft)
        return drafts, text_excerpt

    if magic.startswith("image/"):
        barcode_val, barcode_fmt = decode_barcode_from_image(content)
        if barcode_val and (
            barcode_val.startswith("M1") or barcode_val.startswith("M2")
        ):
            bcbp = parse_iata_bcbp(barcode_val, trip_start_year)
            if bcbp:
                drafts.append(
                    ScanDraft(
                        ticket_type="flight",
                        title=f"{bcbp['flight_number']} {bcbp['origin_iata']} → {bcbp['destination_iata']}",
                        provider=bcbp.get("carrier") or "Aviation Carrier",
                        reference_code=bcbp["reference_code"],
                        holder_name=bcbp["holder_name"],
                        seat_or_room=bcbp.get("seat"),
                        barcode_value=barcode_val,
                        barcode_format=barcode_fmt,
                        field_confidence={"ticket_type": 0.99, "barcode_value": 0.99},
                    )
                )
                return drafts, f"Decoded IATA BCBP from image: {barcode_val[:50]}..."
        elif barcode_val:
            drafts.append(
                ScanDraft(
                    ticket_type="other",
                    title=f"Scanned {barcode_fmt.upper() if barcode_fmt else 'Barcode'} Ticket",
                    barcode_value=barcode_val,
                    barcode_format=barcode_fmt,
                    field_confidence={"barcode_value": 0.99},
                )
            )
            return drafts, f"Decoded {barcode_fmt} barcode from image."
        else:
            drafts.append(
                ScanDraft(
                    ticket_type="other",
                    title=f"Uploaded {Path(filename).stem}",
                    field_confidence={"ticket_type": 0.5},
                    warnings=["No scannable barcode detected in image."],
                )
            )
            return drafts, "Image saved as document."

    # Text plain
    text_str = content.decode("utf-8", errors="replace")
    draft = classify_text_document(text_str, trip_start_year)
    drafts.append(draft)
    return drafts, text_str[:400]
