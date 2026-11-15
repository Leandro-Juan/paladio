import io
import json
import logging
import os
import re
import subprocess
import tempfile
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

from app.schemas.travel_document import TravelDocumentDraft
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
        # Pass 1: raw image as-is
        results = zxingcpp.read_barcodes(image)

        # Pass 2: Grayscale conversion for screenshots with compression / colored backgrounds
        if not results:
            gray = image.convert("L")
            results = zxingcpp.read_barcodes(gray)

        # Pass 3: Monochrome high-contrast binarization for dark-mode mobile screenshots
        if not results:
            mono = image.convert("1")
            results = zxingcpp.read_barcodes(mono)

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


def parse_pkpass(
    content: bytes, trip_start_year: int = 2026
) -> TravelDocumentDraft | None:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            if "pass.json" not in z.namelist():
                return None
            pass_data = json.loads(z.read("pass.json").decode("utf-8"))

            barcode_val = None
            barcode_fmt = None

            def _map_pkpass_barcode_fmt(raw_fmt: str) -> str:
                f = raw_fmt.lower()
                if "qr" in f:
                    return "qr"
                if "pdf417" in f:
                    return "pdf417"
                if "128" in f:
                    return "code128"
                if "matrix" in f:
                    return "datamatrix"
                return "aztec"

            if pass_data.get("barcodes"):
                b = pass_data["barcodes"][0]
                barcode_val = b.get("message")
                barcode_fmt = _map_pkpass_barcode_fmt(b.get("format", ""))
            elif "barcode" in pass_data:
                b = pass_data["barcode"]
                barcode_val = b.get("message")
                barcode_fmt = _map_pkpass_barcode_fmt(b.get("format", ""))

            desc = pass_data.get("description", "Pass")
            org = pass_data.get("organizationName", "")

            # Check boarding pass
            if "boardingPass" in pass_data:
                bp_info = pass_data["boardingPass"]
                # Try parsing BCBP barcode if available
                if barcode_val and (
                    barcode_val.startswith("M1") or barcode_val.startswith("M2")
                ):
                    bcbp = parse_iata_bcbp(barcode_val, trip_start_year)
                    if bcbp:
                        airport_svc = get_airport_service()
                        orig_city = airport_svc.get_city_from_iata(bcbp["origin_iata"])
                        dest_city = airport_svc.get_city_from_iata(
                            bcbp["destination_iata"]
                        )
                        return TravelDocumentDraft(
                            ticket_type="flight",
                            title=f"{bcbp['flight_number']} {bcbp['origin_iata']} → {bcbp['destination_iata']}",
                            provider=bcbp.get("carrier") or org or "Aviation Carrier",
                            reference_code=bcbp["reference_code"],
                            holder_name=bcbp["holder_name"],
                            start_time=bcbp.get("flight_date"),
                            seat_or_room=bcbp.get("seat"),
                            barcode_value=barcode_val,
                            barcode_format=barcode_fmt,
                            metadata={
                                "origin_iata": bcbp["origin_iata"],
                                "destination_iata": bcbp["destination_iata"],
                                "origin_city": orig_city,
                                "destination_city": dest_city,
                                "flight_number": bcbp.get("flight_number"),
                                "carrier": bcbp.get("carrier") or org,
                                "seat": bcbp.get("seat"),
                                "flight_date": bcbp.get("flight_date"),
                            },
                            field_confidence={
                                "ticket_type": 0.99,
                                "barcode_value": 0.99,
                                "title": 0.95,
                            },
                        )

                # Fallback to fields in pass.json
                transit_type = bp_info.get("transitType", "")
                is_non_air_transit = bool(
                    transit_type and transit_type != "PKTransitTypeAir"
                )
                orig_iata = None
                dest_iata = None
                for fld in bp_info.get("primaryFields", []):
                    if fld.get("key") in ("origin", "from", "departure"):
                        orig_iata = fld.get("value")
                    elif fld.get("key") in ("destination", "to", "arrival"):
                        dest_iata = fld.get("value")

                pass_label = "Transit Pass" if is_non_air_transit else "Boarding Pass"
                title = (
                    f"{org} {orig_iata or ''} → {dest_iata or ''}".strip()
                    if (orig_iata or dest_iata)
                    else (f"{org} {pass_label}" if org else desc)
                )
                return TravelDocumentDraft(
                    ticket_type="transit" if is_non_air_transit else "flight",
                    title=title,
                    provider=org,
                    reference_code=barcode_val[:12] if barcode_val else None,
                    barcode_value=barcode_val,
                    barcode_format=barcode_fmt,
                    start_time=pass_data.get("relevantDate"),
                    metadata={"origin_iata": orig_iata, "destination_iata": dest_iata}
                    if (orig_iata or dest_iata)
                    else {},
                    field_confidence={"title": 0.95, "provider": 0.9},
                )
            elif "eventTicket" in pass_data:
                et_info = pass_data["eventTicket"]
                event_date = pass_data.get("relevantDate")
                if not event_date:
                    for sec in (
                        "primaryFields",
                        "secondaryFields",
                        "auxiliaryFields",
                        "headerFields",
                    ):
                        for fld in et_info.get(sec, []):
                            k = str(fld.get("key", "")).lower()
                            lbl = str(fld.get("label", "")).lower()
                            if any(
                                w in k or w in lbl
                                for w in ("date", "fecha", "time", "hora")
                            ):
                                event_date = fld.get("value")
                                break
                        if event_date:
                            break
                return TravelDocumentDraft(
                    ticket_type="attraction",
                    title=desc,
                    provider=org,
                    start_time=event_date,
                    barcode_value=barcode_val,
                    barcode_format=barcode_fmt,
                    field_confidence={"title": 0.95},
                )
            elif (
                "generic" in pass_data
                or "storeCard" in pass_data
                or "coupon" in pass_data
            ):
                style_dict = (
                    pass_data.get("generic")
                    or pass_data.get("storeCard")
                    or pass_data.get("coupon")
                    or {}
                )
                all_fields = (
                    style_dict.get("primaryFields", [])
                    + style_dict.get("secondaryFields", [])
                    + style_dict.get("auxiliaryFields", [])
                )
                pin_code = None
                room_num = None
                check_in_date = None
                check_out_date = None
                for fld in all_fields:
                    k = str(fld.get("key", "")).lower()
                    v = str(fld.get("value", ""))
                    if "pin" in k or "code" in k or "access" in k:
                        pin_code = v
                    if "room" in k or "suite" in k:
                        room_num = v
                    if any(
                        w in k
                        for w in ("checkin", "check-in", "check in", "arrival", "fecha")
                    ):
                        check_in_date = v
                    if any(
                        w in k
                        for w in (
                            "checkout",
                            "check-out",
                            "check out",
                            "departure",
                            "salida",
                        )
                    ):
                        check_out_date = v

                is_hotel = any(
                    w in desc.lower() or w in org.lower()
                    for w in ("hotel", "resort", "inn", "room", "key", "suite")
                )
                ticket_type = "hotel" if is_hotel else "other"
                gen_meta: dict[str, Any] = {}
                if check_in_date:
                    gen_meta["check_in_date"] = check_in_date
                if check_out_date:
                    gen_meta["check_out_date"] = check_out_date
                return TravelDocumentDraft(
                    ticket_type=ticket_type,
                    title=desc or f"{org} Pass",
                    provider=org,
                    access_code=pin_code,
                    seat_or_room=room_num,
                    start_time=check_in_date or pass_data.get("relevantDate"),
                    barcode_value=barcode_val,
                    barcode_format=barcode_fmt,
                    metadata=gen_meta,
                    field_confidence={
                        "title": 0.9,
                        "access_code": 0.95 if pin_code else 0.5,
                    },
                )
    except Exception as e:
        logger.debug(f"PKPASS parse error: {e}")
    return None


def render_pdf_to_images(content: bytes, max_pages: int = 3) -> list[bytes]:
    rendered_images: list[bytes] = []
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            proc = subprocess.run(
                [
                    "pdftoppm",
                    "-png",
                    "-r",
                    "150",
                    "-l",
                    str(max_pages),
                    "-",
                    os.path.join(tmpdir, "page"),
                ],
                input=content,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=15,
            )
            if proc.returncode == 0:
                for img_path in sorted(Path(tmpdir).glob("page-*.png")):
                    rendered_images.append(img_path.read_bytes())
    except Exception as e:
        logger.debug(f"pdftoppm rendering failed: {e}")
    return rendered_images


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

    joined_text = "\n".join(full_text)
    if not extracted_images and len(joined_text.strip()) < 30:
        extracted_images = render_pdf_to_images(content, max_pages=min(num_pages, 3))

    return joined_text, extracted_images


def normalize_time_str(val: str | None) -> str | None:
    if not val:
        return None
    val = val.strip()
    is_pm = bool(re.search(r"pm", val, re.IGNORECASE))
    is_am = bool(re.search(r"am", val, re.IGNORECASE))
    m = re.search(r"(\d{1,2})[:.\-](\d{2})", val)
    if not m:
        return None
    h = int(m.group(1))
    mins = int(m.group(2))
    if is_pm and h < 12:
        h += 12
    elif is_am and h == 12:
        h = 0
    if 0 <= h <= 23 and 0 <= mins <= 59:
        return f"{h:02d}:{mins:02d}"
    return None


def normalize_date_str(val: str | None, trip_start_year: int = 2026) -> str | None:
    if not val:
        return None
    val = val.strip()
    iso_m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", val)
    if iso_m:
        return val
    dm_m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$", val)
    if dm_m:
        p1, p2, yr_str = int(dm_m.group(1)), int(dm_m.group(2)), dm_m.group(3)
        yr = int(yr_str)
        if yr < 100:
            yr += 2000
        if p2 > 12 and p1 <= 12:
            month, day = p1, p2
        else:
            day, month = p1, p2
        try:
            return date(yr, month, day).isoformat()
        except Exception:
            pass
    return None


def extract_dates_from_text(text: str, trip_start_year: int = 2026) -> list[str]:
    found_dates: list[str] = []
    date_matches = re.findall(
        r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", text
    )
    for dm in date_matches:
        norm = normalize_date_str(dm, trip_start_year)
        if norm and norm not in found_dates:
            found_dates.append(norm)

    month_regex = r"\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember))\b(?:\s+(\d{4}))?"
    for m in re.finditer(month_regex, text, re.IGNORECASE):
        day = int(m.group(1))
        mon_str = m.group(2)[:3].lower()
        yr = int(m.group(3)) if m.group(3) else trip_start_year
        month_map = {
            "jan": 1,
            "feb": 2,
            "mar": 3,
            "apr": 4,
            "may": 5,
            "jun": 6,
            "jul": 7,
            "aug": 8,
            "sep": 9,
            "oct": 10,
            "nov": 11,
            "dec": 12,
        }
        if mon_str in month_map:
            try:
                iso = date(yr, month_map[mon_str], day).isoformat()
                if iso not in found_dates:
                    found_dates.append(iso)
            except Exception:
                pass
    return found_dates


def run_tesseract_ocr(img_bytes: bytes) -> str:
    try:
        proc = subprocess.run(
            ["tesseract", "stdin", "stdout", "-l", "eng+spa"],
            input=img_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=15,
        )
        if proc.returncode == 0:
            return proc.stdout.decode("utf-8", errors="replace")
    except Exception:
        pass

    try:
        proc = subprocess.run(
            ["tesseract", "stdin", "stdout"],
            input=img_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=15,
        )
        if proc.returncode == 0:
            return proc.stdout.decode("utf-8", errors="replace")
    except Exception as e:
        logger.debug(f"Tesseract OCR failed: {e}")
    return ""


def classify_text_document(
    text: str, trip_start_year: int = 2026
) -> TravelDocumentDraft:
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
            airport_svc = get_airport_service()
            orig_city = airport_svc.get_city_from_iata(orig)
            dest_city = airport_svc.get_city_from_iata(dest)

            # Check if text around barcode has hours
            dep_h = None
            arr_h = None
            dep_m = re.search(
                r"(?:departs?|departure|salida|départ|std|boarding(?:\s+time)?|hora(?:\s+de\s+salida)?|takeoff)[:\s#]*([0-2]?\d[:.][0-5]\d(?:\s*(?:am|pm))?)",
                text,
                re.IGNORECASE,
            )
            if dep_m:
                dep_h = normalize_time_str(dep_m.group(1))

            arr_m = re.search(
                r"(?:arrives?|arrival|llegada|lands?|landing|sta|hora(?:\s+de\s+llegada)?|estimated\s+arrival)[:\s#]*([0-2]?\d[:.][0-5]\d(?:\s*(?:am|pm))?)",
                text,
                re.IGNORECASE,
            )
            if arr_m:
                arr_h = normalize_time_str(arr_m.group(1))

            trip_start_hour = arr_h or dep_h or "09:00"

            conf.update(
                {
                    "ticket_type": 0.99,
                    "origin_iata": 0.98,
                    "destination_iata": 0.98,
                    "flight_number": 0.95,
                }
            )
            return TravelDocumentDraft(
                ticket_type="flight",
                title=f"{fl_num} {orig} → {dest}",
                provider=bcbp_parsed.get("carrier") or "Commercial Airline",
                reference_code=bcbp_parsed["reference_code"],
                holder_name=bcbp_parsed["holder_name"],
                start_time=f"{bcbp_parsed['flight_date']}T{dep_h or '10:00'}:00"
                if bcbp_parsed["flight_date"]
                else None,
                seat_or_room=bcbp_parsed.get("seat"),
                barcode_value=bcbp_match.group(0),
                barcode_format="pdf417",
                metadata={
                    "flight_number": fl_num,
                    "origin_iata": orig,
                    "destination_iata": dest,
                    "origin_city": orig_city,
                    "destination_city": dest_city,
                    "cabin_class": bcbp_parsed.get("cabin_class"),
                    "carrier": bcbp_parsed.get("carrier"),
                    "flight_date": bcbp_parsed.get("flight_date"),
                    "flight_departure_hour": dep_h,
                    "flight_arrival_hour": arr_h,
                    "departure_hour": trip_start_hour,
                    "arrival_hour": "20:00",
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
        "aerolinea",
        "boarding time",
        "boarding",
        "gate",
        "asiento",
        "seat",
        "priority",
        "pnr",
        "terminal",
        "departure",
        "arrival",
        "departs",
        "arrives",
        "airport",
        "aeropuerto",
        "ryanair",
        "iberia",
        "vueling",
        "easyjet",
        "lufthansa",
        "aer lingus",
        "british airways",
        "booking ref",
        "seq",
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
        "booking",
        "guest",
        "huesped",
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
        "bahn",
        "deutsche bahn",
        "einzelticket",
        "preisstufe",
        "vrr",
        "vbb",
        "fahrkarte",
        "billet",
        "voiture",
        "voyageurs",
        "gare",
        "bahnhof",
        "al boraq",
        "oncf",
        "tgv",
        "thalys",
        "ice",
        "s-bahn",
        "u-bahn",
        "metro",
        "tram",
        "subway",
        "rail",
        "railway",
        "ferry",
        "transit",
    )

    score_flight = sum(1 for k in flight_keywords if k in text_lower)
    hotel_clean_text = re.sub(
        r"\bbooking\s*(?:ref|reference|code|number)\b", "", text_lower
    )
    score_hotel = sum(1 for k in hotel_keywords if k in hotel_clean_text)
    score_attraction = sum(1 for k in attraction_keywords if k in text_lower)
    score_transit = sum(1 for k in transit_keywords if k in text_lower)

    # Flight regexes (prefer labeled flight numbers like Flight: LH 1112)
    flight_num_match = re.search(
        r"(?:flight|vuelo|flt|fl)[\s#:]*([A-Z0-9]{2}\s?\d{3,4})\b",
        text,
        re.IGNORECASE,
    )
    if not flight_num_match:
        flight_num_match = re.search(r"\b([A-Z]{2}\s?\d{3,4})\b", text)
    flight_num = (
        flight_num_match.group(1).replace(" ", "") if flight_num_match else None
    )
    if flight_num:
        score_flight += 3

    # IATA code validation in scoring
    airport_svc = get_airport_service()
    NON_AIRPORT_ACRONYMS = {
        "PNR",
        "ETA",
        "ETD",
        "STD",
        "STA",
        "UTC",
        "GMT",
        "EUR",
        "USD",
        "GBP",
        "PIN",
        "REF",
        "AVE",
        "BUS",
        "CAR",
        "TAX",
        "DAY",
        "DOE",
        "THE",
        "AND",
        "FOR",
        "AIR",
        "VIP",
        "NEW",
        "NOT",
        "YES",
        "ALL",
        "DIE",
        "DES",
        "DER",
        "DAS",
        "EIN",
        "VON",
        "UND",
        "MIT",
        "LES",
        "SUR",
        "PAR",
        "UNE",
        "EST",
        "DEL",
        "LAS",
        "LOS",
        "CON",
        "POR",
        "VIA",
        "VRR",
        "VBB",
        "TGV",
        "ICE",
        "TER",
        "RER",
    }
    iatas = re.findall(r"\b([A-Z]{3})\b", text)
    valid_iatas = [
        i
        for i in iatas
        if i not in NON_AIRPORT_ACRONYMS and airport_svc.is_valid_iata(i)
    ]
    if len(valid_iatas) >= 2 and (score_transit == 0 or flight_num is not None):
        score_flight += 2

    scores = [
        ("flight", score_flight),
        ("hotel", score_hotel),
        ("attraction", score_attraction),
        ("transit", score_transit),
    ]
    scores.sort(key=lambda x: x[1], reverse=True)
    best_type, best_score = scores[0]

    # Regex search helpers
    INVALID_REF_CODES = {
        "REFERENCE",
        "BOOKING",
        "DETAILS",
        "CONFIRMATION",
        "RESERVATION",
        "NUMBER",
        "LOCALIZADOR",
        "INFORMATION",
        "PASSENGER",
        "CUSTOMER",
        "FLIGHT",
        "HOTEL",
        "ROOM",
        "STATUS",
        "STREET",
        "AVENIDA",
        "ERENCE",
    }

    ref_code = None
    for pnr_match in re.finditer(
        r"\b(?:PNR|Booking\s*Reference|Booking\s*Ref|Reservation(?:\s*Reference|\s*Ref)?|Localizador|Confirmation(?:\s*Number|\s*Code|\s*Ref)?|Reference|Ref)(?:[\s/]+(?:PNR|Ref|Código|Code))*(?:[ \t#:\(\)\-]+)+([A-Z0-9\-]{5,14})\b",
        text,
        re.IGNORECASE,
    ):
        candidate = pnr_match.group(1)
        if candidate.upper() not in INVALID_REF_CODES and not (
            flight_num and candidate.upper() == flight_num.upper()
        ):
            ref_code = candidate
            break
    if not ref_code:
        for pnr_m in re.finditer(
            r"(?i:\b(?:PNR|Booking\s*Reference|Booking\s*Ref|Reservation(?:\s*Reference|\s*Ref)?|Localizador|Confirmation)[\s\S]{0,40}?\b)([A-Z0-9\-]{5,10})\b",
            text,
        ):
            candidate = pnr_m.group(1).upper()
            if (
                candidate not in INVALID_REF_CODES
                and not candidate.startswith("-")
                and not (flight_num and candidate == flight_num.upper())
            ):
                ref_code = pnr_m.group(1)
                break

    # Hotel access code / pin
    INVALID_ACCESS_CODES = {
        "THE",
        "CODE",
        "DOOR",
        "PIN",
        "KEYPAD",
        "LOCKBOX",
        "ACCESS",
        "ROOM",
        "USE",
        "FOR",
        "AND",
    }
    code_match = re.search(
        r"(?:door\s+code|access\s+code|código(?:\s+de\s+acceso)?|keypad\s+pin|smart\s+lock(?:\s+keypad)?\s+pin|lockbox(?:\s+code)?|keypad|pin)(?:[\s/]+(?:pin|code|keypad|lockbox))*[:\s#]+(?:is\s+)?([A-Za-z0-9\-#]{3,10})",
        text,
        re.IGNORECASE,
    )
    access_code = None
    if (
        code_match
        and code_match.group(1).upper().rstrip("#") not in INVALID_ACCESS_CODES
    ):
        access_code = code_match.group(1).rstrip("#")
    if not access_code:
        for cm in re.finditer(
            r"\b(?:PIN|Door\s*Code|Lockbox)[:\s#]+(?:is\s+)?([A-Za-z0-9\-#]{3,10})",
            text,
            re.IGNORECASE,
        ):
            cand = cm.group(1).upper().rstrip("#")
            if cand not in INVALID_ACCESS_CODES:
                access_code = cm.group(1).rstrip("#")
                break

    # Dates extraction (supports single or multi-date itineraries)
    extracted_dates = extract_dates_from_text(text, trip_start_year)
    date_found = extracted_dates[0] if extracted_dates else None
    return_date_found = extracted_dates[1] if len(extracted_dates) > 1 else None

    # Time extraction
    dep_hour = None
    arr_hour = None

    dep_m = re.search(
        r"(?:departs?|departure|salida|départ|leaves?|std|boarding(?:\s+time)?|hora(?:\s+de\s+salida)?|takeoff)[:\s#]*([0-2]?\d[:.\-][0-5]\d(?:\s*(?:am|pm))?)",
        text,
        re.IGNORECASE,
    )
    if dep_m:
        dep_hour = normalize_time_str(dep_m.group(1))

    arr_m = re.search(
        r"(?:arrives?|arrival|llegada|lands?|landing|sta|hora(?:\s+de\s+llegada)?|estimated\s+arrival)[:\s#]*([0-2]?\d[:.\-][0-5]\d(?:\s*(?:am|pm))?)",
        text,
        re.IGNORECASE,
    )
    if arr_m:
        arr_hour = normalize_time_str(arr_m.group(1))

    found_times = re.findall(
        r"\b([0-2]?\d[:.\-][0-5]\d(?:\s*(?:am|pm))?)\b", text, re.IGNORECASE
    )
    norm_times = [normalize_time_str(t) for t in found_times if normalize_time_str(t)]
    if not dep_hour and norm_times:
        dep_hour = norm_times[0]
    if not arr_hour and len(norm_times) > 1:
        arr_hour = norm_times[1]

    # Special case: boarding time vs departure takeoff time
    if "departs" in text_lower and len(norm_times) >= 2 and "boarding" in text_lower:
        dep_hour = norm_times[-1]

    # Return/outbound takeoff time if explicitly stated
    ret_dep_hour = None
    ret_m = re.search(
        r"(?:return|regreso|vuelta|outbound|inbound).*?(?:departs?|departure|salida|std|takeoff)[:\s#]*([0-2]?\d[:.\-][0-5]\d(?:\s*(?:am|pm))?)",
        text,
        re.IGNORECASE,
    )
    if ret_m:
        ret_dep_hour = normalize_time_str(ret_m.group(1))

    # User rule: trip start hour is determined by flight landing arrival at destination;
    # trip end hour is determined by outbound flight takeoff departure from destination.
    trip_start_hour = arr_hour or dep_hour or "09:00"
    trip_end_hour = ret_dep_hour or (
        dep_hour if (dep_hour and arr_hour and dep_hour != arr_hour) else "20:00"
    )

    if best_score >= 2 and best_type == "flight":
        orig = valid_iatas[0] if len(valid_iatas) > 0 else None
        dest = valid_iatas[1] if len(valid_iatas) > 1 else None

        # Fallback to city detection if IATAs not explicitly formatted
        if not orig or not dest:
            for word in re.findall(r"\b[A-Z][a-zA-Z]{2,}\b", text):
                found_i = airport_svc.get_iata_from_city(word)
                if found_i:
                    if not orig:
                        orig = found_i
                    elif not dest and found_i != orig:
                        dest = found_i
                        break

        orig_city = airport_svc.get_city_from_iata(orig) if orig else None
        dest_city = airport_svc.get_city_from_iata(dest) if dest else None

        # Carrier detection
        carrier = None
        known_carriers = {
            "FR": "Ryanair",
            "IB": "Iberia",
            "VY": "Vueling",
            "U2": "easyJet",
            "EZY": "easyJet",
            "LH": "Lufthansa",
            "BA": "British Airways",
            "AF": "Air France",
            "KL": "KLM",
            "EI": "Aer Lingus",
            "W6": "Wizz Air",
        }
        for name in [
            "ryanair",
            "iberia",
            "vueling",
            "easyjet",
            "lufthansa",
            "british airways",
            "air france",
            "klm",
            "aer lingus",
            "wizz air",
        ]:
            if name in text_lower:
                carrier = name.title()
                break
        if not carrier and flight_num and flight_num[:2] in known_carriers:
            carrier = known_carriers[flight_num[:2]]

        # Seat extraction
        seat = None
        seat_m = re.search(
            r"\b(?:seat|asiento)[\s\S]{0,30}?\b([0-9]{1,3}[A-K])\b",
            text,
            re.IGNORECASE,
        )
        if seat_m:
            seat = seat_m.group(1)
        if not seat:
            seat_m2 = re.search(
                r"\b([0-9]{1,3}[A-K])\s+(?:window|aisle|middle|wincow)\b",
                text,
                re.IGNORECASE,
            )
            if seat_m2:
                seat = seat_m2.group(1)

        # Passenger name extraction
        holder_name = None
        name_m = re.search(
            r"\b(?:passenger|passenger\s*name|name|pasajero|nombre|viajero)[:\s#]+([A-Z][a-zA-Z\s\-]+)",
            text,
            re.IGNORECASE,
        )
        if name_m:
            holder_name = name_m.group(1).strip()
        else:
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            if lines:
                first_line = lines[0]
                if (
                    re.match(r"^[A-Z][a-zA-Z\s\-]+$", first_line)
                    and len(first_line.split()) >= 2
                    and len(first_line) < 50
                    and not any(
                        k in first_line.lower()
                        for k in ("flight", "vuelo", "boarding", "hotel")
                    )
                ):
                    holder_name = first_line

        title = f"{flight_num or 'Flight'} {orig or orig_city or 'Flight'} → {dest or dest_city or 'Arrival'}"
        conf.update({"ticket_type": 0.85, "title": 0.8})
        return TravelDocumentDraft(
            ticket_type="flight",
            title=title,
            provider=carrier or "Aviation Carrier",
            reference_code=ref_code,
            holder_name=holder_name,
            seat_or_room=seat,
            start_time=f"{date_found}T{dep_hour or '10:00'}:00" if date_found else None,
            metadata={
                "origin_iata": orig,
                "destination_iata": dest,
                "origin_city": orig_city,
                "destination_city": dest_city,
                "flight_number": flight_num,
                "carrier": carrier,
                "seat": seat,
                "departure_date": date_found,
                "return_date": return_date_found,
                "flight_departure_hour": dep_hour,
                "flight_arrival_hour": arr_hour,
                "departure_hour": trip_start_hour,
                "arrival_hour": trip_end_hour,
            },
            field_confidence=conf,
            warnings=["Verification advised for extracted airport times"]
            if not date_found
            else [],
        )

    if best_score >= 2 and best_type == "hotel":
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        hotel_name = None
        hotel_m = re.search(
            r"\b(?:Hotel|Hostel|Resort|Accommodation|Alojamiento)[:\s#]+([^\n\r]+)",
            text,
            re.IGNORECASE,
        )
        if hotel_m and not re.search(
            r"\b(?:reservation|confirmation|booking)\b",
            hotel_m.group(1),
            re.IGNORECASE,
        ):
            hotel_name = hotel_m.group(1).strip()[:60]
        else:
            for line in lines[:8]:
                if re.search(
                    r"\b(?:reservation|confirmation|booking)\b", line, re.IGNORECASE
                ):
                    continue
                if re.search(
                    r"\b(?:hotel|hostel|resort|suites|inn|lodging|apartamentos)\b",
                    line,
                    re.IGNORECASE,
                ):
                    hotel_name = line[:60].strip()
                    break
        if not hotel_name and lines:
            for line in lines[:5]:
                if not re.search(
                    r"\b(?:reservation|confirmation|booking)\b", line, re.IGNORECASE
                ):
                    hotel_name = line[:60].strip()
                    break

        checkin_m = re.search(
            r"(?:check-?in|entrada|arrival)[:\s#]*(?:(?:from|starting|at|desde|after)?\s*)?([0-2]?\d[:.][0-5]\d(?:\s*(?:am|pm))?)",
            text,
            re.IGNORECASE,
        )
        checkin_hour = normalize_time_str(checkin_m.group(1)) if checkin_m else "15:00"

        checkout_m = re.search(
            r"(?:check-?out|checkout|salida|departure)[:\s#]*(?:(?:until|before|by|hasta)?\s*)?([0-2]?\d[:.][0-5]\d(?:\s*(?:am|pm))?)",
            text,
            re.IGNORECASE,
        )
        checkout_hour = (
            normalize_time_str(checkout_m.group(1)) if checkout_m else "11:00"
        )

        # Identify city in hotel text
        hotel_city = None
        hotel_iata = None
        airport_svc = get_airport_service()

        city_m = re.search(
            r"\b(?:City|Ciudad|Location|Ubicación|Destination)[:\s#]*([^\n\r,]{3,40})",
            text,
            re.IGNORECASE,
        )
        if city_m:
            candidate = city_m.group(1).strip()
            found_iata = airport_svc.get_iata_from_city(candidate)
            if found_iata:
                hotel_city = candidate
                hotel_iata = found_iata

        if not hotel_city:
            stop_words = {
                "hotel",
                "hostel",
                "reservation",
                "confirmation",
                "booking",
                "checkin",
                "checkout",
                "guest",
                "room",
                "arrival",
                "departure",
                "grand",
                "central",
                "resort",
                "suites",
                "inn",
                "door",
                "code",
                "access",
                "lodging",
                "alojamiento",
                "reserva",
                "habitacion",
            }
            for word in re.findall(r"\b[A-Z][a-zA-Z]{2,}\b", text):
                if word.lower() in stop_words:
                    continue
                found_iata = airport_svc.get_iata_from_city(word)
                if found_iata:
                    hotel_city = word
                    hotel_iata = found_iata
                    break

        guest_m = re.search(
            r"\b(?:Guest(?:\s*Name)?|Hu[eé]sped|Name|Titular)[:\s#]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.\-']{2,50})",
            text,
            re.IGNORECASE,
        )
        hotel_holder = (
            guest_m.group(1).strip().splitlines()[0].strip() if guest_m else None
        )

        room_m = re.search(
            r"\b(?:Room(?:\s*Type)?|Habitaci[oó]n)[:\s#]+([^\n\r]{3,60})",
            text,
            re.IGNORECASE,
        )
        hotel_room = room_m.group(1).strip() if room_m else None

        addr_m = re.search(
            r"\b(?:Address|Direcci[oó]n)[:\s#]+([^\n\r]{5,100})",
            text,
            re.IGNORECASE,
        )
        hotel_addr = addr_m.group(1).strip() if addr_m else None

        price_m = re.search(
            r"\b(?:Total\s*Price|Total|Price|Precio)[:\s#]*(?:EUR|USD|GBP|€|\$|£)?\s*(\d+(?:[.,]\d{2})?)",
            text,
            re.IGNORECASE,
        )
        hotel_price = float(price_m.group(1).replace(",", ".")) if price_m else None

        conf.update({"ticket_type": 0.85, "title": 0.75})
        if access_code:
            conf["access_code"] = 0.95
        return TravelDocumentDraft(
            ticket_type="hotel",
            title=hotel_name or "Hotel Lodging",
            reference_code=ref_code,
            holder_name=hotel_holder,
            access_code=access_code,
            seat_or_room=hotel_room,
            location_or_venue=hotel_addr,
            price=hotel_price,
            start_time=f"{date_found}T{checkin_hour}:00" if date_found else None,
            end_time=f"{return_date_found}T{checkout_hour}:00"
            if return_date_found
            else None,
            metadata={
                "hotel_name": hotel_name,
                "destination_city": hotel_city,
                "destination_iata": hotel_iata,
                "check_in_date": date_found,
                "check_out_date": return_date_found,
                "check_in_hour": checkin_hour,
                "check_out_hour": checkout_hour,
                "departure_hour": checkin_hour,
                "arrival_hour": checkout_hour,
            },
            field_confidence=conf,
            warnings=["Extracted room access code requires verification"]
            if access_code
            else [],
        )

    if best_score >= 2 and best_type == "attraction":
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        title = lines[0][:60] if lines else "Museum & Attraction Pass"
        conf.update({"ticket_type": 0.8, "title": 0.7})
        return TravelDocumentDraft(
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
        return TravelDocumentDraft(
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
    return TravelDocumentDraft(
        ticket_type="other",
        title=title,
        reference_code=ref_code,
        notes=text[:500],
        field_confidence={"ticket_type": 0.5, "title": 0.5},
        warnings=["Unrecognized document structure; saved as general voucher"],
    )


async def scan_travel_document(
    content: bytes, filename: str, trip_start_year: int = 2026
) -> tuple[list[TravelDocumentDraft], str]:
    if len(content) > MAX_FILE_SIZE:
        raise ValueError("File exceeds maximum size limit of 10 MB.")

    magic = detect_magic_type(content)
    if not magic:
        raise ValueError("Unsupported file format or unreadable binary content.")

    drafts: list[TravelDocumentDraft] = []
    text_excerpt = ""

    if magic == "application/vnd.apple.pkpass":
        draft = parse_pkpass(content, trip_start_year)
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

        if len(extracted_text.strip()) < 30 and images:
            ocr_parts = []
            for img in images:
                txt = run_tesseract_ocr(img)
                if txt.strip():
                    ocr_parts.append(txt.strip())
            if ocr_parts:
                extracted_text = "\n\n".join(ocr_parts)
                text_excerpt = extracted_text[:400]

        draft = classify_text_document(extracted_text, trip_start_year)
        if barcode_val and not draft.barcode_value:
            draft.barcode_value = barcode_val
            draft.barcode_format = barcode_fmt
            draft.field_confidence["barcode_value"] = 0.99
            # Check if barcode text is BCBP
            if barcode_val.startswith("M1") or barcode_val.startswith("M2"):
                bcbp = parse_iata_bcbp(barcode_val, trip_start_year)
                if bcbp:
                    orig_city = get_airport_service().get_city_from_iata(
                        bcbp["origin_iata"]
                    )
                    dest_city = get_airport_service().get_city_from_iata(
                        bcbp["destination_iata"]
                    )
                    draft.ticket_type = "flight"
                    draft.reference_code = bcbp["reference_code"]
                    draft.holder_name = bcbp["holder_name"]
                    draft.seat_or_room = bcbp.get("seat")
                    draft.start_time = bcbp.get("flight_date")
                    draft.metadata.update(
                        {
                            "origin_iata": bcbp["origin_iata"],
                            "destination_iata": bcbp["destination_iata"],
                            "origin_city": orig_city,
                            "destination_city": dest_city,
                            "flight_number": bcbp.get("flight_number"),
                            "carrier": bcbp.get("carrier"),
                            "seat": bcbp.get("seat"),
                            "flight_date": bcbp.get("flight_date"),
                        }
                    )

        drafts.append(draft)
        return drafts, text_excerpt

    if magic.startswith("image/"):
        barcode_val, barcode_fmt = decode_barcode_from_image(content)
        if barcode_val and (
            barcode_val.startswith("M1") or barcode_val.startswith("M2")
        ):
            bcbp = parse_iata_bcbp(barcode_val, trip_start_year)
            if bcbp:
                orig_city = get_airport_service().get_city_from_iata(
                    bcbp["origin_iata"]
                )
                dest_city = get_airport_service().get_city_from_iata(
                    bcbp["destination_iata"]
                )
                drafts.append(
                    TravelDocumentDraft(
                        ticket_type="flight",
                        title=f"{bcbp['flight_number']} {bcbp['origin_iata']} → {bcbp['destination_iata']}",
                        provider=bcbp.get("carrier") or "Aviation Carrier",
                        reference_code=bcbp["reference_code"],
                        holder_name=bcbp["holder_name"],
                        start_time=bcbp.get("flight_date"),
                        seat_or_room=bcbp.get("seat"),
                        barcode_value=barcode_val,
                        barcode_format=barcode_fmt,
                        metadata={
                            "origin_iata": bcbp["origin_iata"],
                            "destination_iata": bcbp["destination_iata"],
                            "origin_city": orig_city,
                            "destination_city": dest_city,
                            "flight_number": bcbp.get("flight_number"),
                            "carrier": bcbp.get("carrier"),
                            "seat": bcbp.get("seat"),
                            "flight_date": bcbp.get("flight_date"),
                        },
                        field_confidence={"ticket_type": 0.99, "barcode_value": 0.99},
                    )
                )
                return drafts, f"Decoded IATA BCBP from image: {barcode_val[:50]}..."
        # If no BCBP detected in image, run sovereign local OCR on image screenshot
        ocr_text = run_tesseract_ocr(content)
        if ocr_text and len(ocr_text.strip()) > 15:
            draft = classify_text_document(ocr_text, trip_start_year)
            if barcode_val:
                draft.barcode_value = barcode_val
                draft.barcode_format = barcode_fmt
            drafts.append(draft)
            return drafts, f"Extracted via local OCR: {ocr_text.strip()[:300]}..."
        elif barcode_val:
            drafts.append(
                TravelDocumentDraft(
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
                TravelDocumentDraft(
                    ticket_type="other",
                    title=f"Uploaded {Path(filename).stem}",
                    field_confidence={"ticket_type": 0.5},
                    warnings=[
                        "No scannable barcode or readable text detected in image."
                    ],
                )
            )
            return drafts, "Image saved as document."

    # Text plain or email
    text_str = content.decode("utf-8", errors="replace")
    if filename.lower().endswith(".eml") or (
        "from:" in text_str[:200].lower() and "subject:" in text_str[:500].lower()
    ):
        try:
            import email
            from email import policy

            eml_msg = email.message_from_bytes(content, policy=policy.default)
            subject = eml_msg.get("subject", "")
            body = eml_msg.get_body(preferencelist=("plain", "html"))
            if body:
                extracted_body = body.get_content()
                if body.get_content_type() == "text/html":
                    extracted_body = re.sub(r"<[^>]+>", " ", extracted_body)
                text_str = f"{subject}\n\n{extracted_body}"
        except Exception as e:
            logger.debug(f"EML parsing fallback: {e}")

    draft = classify_text_document(text_str, trip_start_year)
    drafts.append(draft)
    return drafts, text_str[:400]
