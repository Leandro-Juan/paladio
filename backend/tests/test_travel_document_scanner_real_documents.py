import pytest
from pathlib import Path
from httpx import AsyncClient

from app.services.travel_document_scanner import scan_travel_document

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "travel_documents"


@pytest.mark.asyncio
async def test_pkpass_boarding_passes():
    """Verify scanning Apple Wallet .pkpass files (flights, generic hotel pass, attraction)."""
    bp_dir = FIXTURES_DIR / "boarding_passes"

    # 1. Iberia PKPASS (MAD -> SVQ)
    iberia_path = bp_dir / "boarding_pass_iberia.pkpass"
    assert iberia_path.exists()
    drafts, excerpt = await scan_travel_document(
        iberia_path.read_bytes(), iberia_path.name
    )
    assert len(drafts) == 1
    d = drafts[0]
    assert d.ticket_type == "flight"
    assert "IB3166" in d.title
    assert "MAD" in d.title and "SVQ" in d.title
    assert d.reference_code == "IB1234"
    assert d.seat_or_room == "012A"
    assert d.barcode_format == "pdf417"
    assert d.metadata.get("origin_iata") == "MAD"
    assert d.metadata.get("destination_iata") == "SVQ"

    # 2. Lufthansa PKPASS (FRA -> MAD)
    lh_path = bp_dir / "boarding_pass_lufthansa.pkpass"
    drafts, _ = await scan_travel_document(lh_path.read_bytes(), lh_path.name)
    assert len(drafts) == 1
    d = drafts[0]
    assert d.ticket_type == "flight"
    assert "LH1112" in d.title
    assert d.reference_code == "ABC123"
    assert d.seat_or_room == "004C"
    assert d.barcode_format == "aztec"

    # 3. Delta PKPASS (ATL -> CDG)
    dl_path = bp_dir / "boarding_pass_delta.pkpass"
    drafts, _ = await scan_travel_document(dl_path.read_bytes(), dl_path.name)
    assert len(drafts) == 1
    d = drafts[0]
    assert d.ticket_type == "flight"
    assert "ATL" in d.title and "CDG" in d.title
    assert d.reference_code == "QWE123"
    assert d.barcode_format == "qr"

    # 4. Generic Hotel Room Key PKPASS
    hotel_key_path = bp_dir / "generic_hotel_key.pkpass"
    drafts, _ = await scan_travel_document(
        hotel_key_path.read_bytes(), hotel_key_path.name
    )
    assert len(drafts) == 1
    d = drafts[0]
    assert d.ticket_type == "hotel"
    assert d.access_code == "4921"
    assert d.seat_or_room == "Suite 402"
    assert "Alfonso XIII" in d.title

    # 5. Prado Museum Event Ticket PKPASS
    prado_path = bp_dir / "event_ticket_prado.pkpass"
    drafts, _ = await scan_travel_document(prado_path.read_bytes(), prado_path.name)
    assert len(drafts) == 1
    d = drafts[0]
    assert d.ticket_type == "attraction"
    assert "Prado" in d.title or "Entrada General" in d.title


@pytest.mark.asyncio
async def test_pdf_boarding_passes():
    """Verify scanning A4 / mobile airline boarding pass PDFs with embedded barcodes."""
    bp_dir = FIXTURES_DIR / "boarding_passes"

    # 1. American Airlines PDF (MSY -> PHX)
    aa_pdf = bp_dir / "boarding_pass_american_msy_phx.pdf"
    assert aa_pdf.exists()
    drafts, _ = await scan_travel_document(aa_pdf.read_bytes(), aa_pdf.name)
    assert len(drafts) == 1
    d = drafts[0]
    assert d.ticket_type == "flight"
    assert "AA2819" in d.title
    assert d.reference_code == "JKLEAJ"
    assert d.barcode_format == "pdf417"

    # 2. Iberia PDF (MAD -> SVQ)
    ib_pdf = bp_dir / "boarding_pass_iberia_mad_svq.pdf"
    assert ib_pdf.exists()
    drafts, _ = await scan_travel_document(ib_pdf.read_bytes(), ib_pdf.name)
    assert len(drafts) == 1
    d = drafts[0]
    assert d.ticket_type == "flight"
    assert "IB3166" in d.title
    assert "MAD" in d.title and "SVQ" in d.title

    # 3. Lufthansa PDF (FRA -> GVA)
    lh_pdf = bp_dir / "boarding_pass_lufthansa_fra_gva.pdf"
    assert lh_pdf.exists()
    drafts, _ = await scan_travel_document(lh_pdf.read_bytes(), lh_pdf.name)
    assert len(drafts) == 1
    d = drafts[0]
    assert d.ticket_type == "flight"
    assert "LH3664" in d.title


@pytest.mark.asyncio
async def test_screenshot_boarding_passes():
    """Verify scanning screenshot images (PDF417, Aztec, low-contrast dark mode, QR, OCR)."""
    bp_dir = FIXTURES_DIR / "boarding_passes"

    # 1. PDF417 screenshot
    s_pdf417 = bp_dir / "screenshot_american_pdf417.png"
    drafts, _ = await scan_travel_document(s_pdf417.read_bytes(), s_pdf417.name)
    assert len(drafts) == 1
    assert drafts[0].ticket_type == "flight"
    assert drafts[0].barcode_format == "pdf417"
    assert drafts[0].reference_code == "JKLEAJ"

    # 2. Aztec screenshot
    s_aztec = bp_dir / "screenshot_aztec.png"
    drafts, _ = await scan_travel_document(s_aztec.read_bytes(), s_aztec.name)
    assert len(drafts) == 1
    assert drafts[0].ticket_type == "flight"
    assert drafts[0].barcode_format == "aztec"

    # 3. Low-contrast dark mode Aztec screenshot
    s_dark = bp_dir / "screenshot_darkmode_wallet.png"
    drafts, _ = await scan_travel_document(s_dark.read_bytes(), s_dark.name)
    assert len(drafts) == 1
    assert drafts[0].ticket_type == "flight"
    assert drafts[0].barcode_format == "aztec"
    assert drafts[0].reference_code == "IG866Y"

    # 4. QR screenshot
    s_qr = bp_dir / "screenshot_qr.png"
    drafts, _ = await scan_travel_document(s_qr.read_bytes(), s_qr.name)
    assert len(drafts) == 1
    assert drafts[0].ticket_type == "flight"
    assert drafts[0].barcode_format == "qr"

    # 5. Mobile app screen with text (OCR fallback)
    s_txt = bp_dir / "screenshot_mobile_app_text.png"
    drafts, _ = await scan_travel_document(s_txt.read_bytes(), s_txt.name)
    assert len(drafts) == 1
    assert drafts[0].ticket_type == "flight"


@pytest.mark.asyncio
async def test_hotel_confirmations():
    """Verify scanning Booking.com, Airbnb, and Marriott confirmations (PDF, EML, TXT, Screenshot)."""
    h_dir = FIXTURES_DIR / "hotel_confirmations"

    # 1. Booking.com PDF
    b_pdf = h_dir / "booking_com_hotel_alfonso_xiii.pdf"
    drafts, _ = await scan_travel_document(b_pdf.read_bytes(), b_pdf.name)
    assert len(drafts) == 1
    d = drafts[0]
    assert d.ticket_type == "hotel"
    assert "Alfonso XIII" in d.title
    assert d.reference_code == "BK-9842104"
    assert d.access_code == "4921"
    assert d.metadata.get("destination_city") == "Sevilla"

    # 2. Airbnb PDF
    ab_pdf = h_dir / "airbnb_loft_sevilla_checkin.pdf"
    drafts, _ = await scan_travel_document(ab_pdf.read_bytes(), ab_pdf.name)
    assert len(drafts) == 1
    assert drafts[0].ticket_type == "hotel"
    assert drafts[0].access_code == "2580"

    # 3. Booking.com EML email
    b_eml = h_dir / "booking_com_confirmation.eml"
    drafts, _ = await scan_travel_document(b_eml.read_bytes(), b_eml.name)
    assert len(drafts) == 1
    assert drafts[0].ticket_type == "hotel"
    assert drafts[0].reference_code == "BK-9842104"
    assert drafts[0].access_code == "4921"

    # 4. Airbnb EML email
    ab_eml = h_dir / "airbnb_checkin_instructions.eml"
    drafts, _ = await scan_travel_document(ab_eml.read_bytes(), ab_eml.name)
    assert len(drafts) == 1
    assert drafts[0].ticket_type == "hotel"
    assert drafts[0].reference_code == "HM94120A"
    assert drafts[0].access_code == "2580"

    # 5. Marriott TXT confirmation
    m_txt = h_dir / "marriott_bonvoy_reservation.txt"
    drafts, _ = await scan_travel_document(m_txt.read_bytes(), m_txt.name)
    assert len(drafts) == 1
    assert drafts[0].ticket_type == "hotel"
    assert drafts[0].reference_code == "MRT77129"
    assert drafts[0].access_code == "7129"

    # 6. Hotel app screenshot
    h_png = h_dir / "hotel_booking_screenshot.png"
    drafts, _ = await scan_travel_document(h_png.read_bytes(), h_png.name)
    assert len(drafts) == 1
    assert drafts[0].ticket_type == "hotel"
    assert drafts[0].access_code == "4921"


@pytest.mark.asyncio
async def test_flight_confirmations():
    """Verify scanning Iberia, Ryanair, British Airways, and Lufthansa flight confirmations."""
    f_dir = FIXTURES_DIR / "flight_confirmations"

    # 1. Iberia EML email
    ib_eml = f_dir / "iberia_flight_booking.eml"
    drafts, _ = await scan_travel_document(ib_eml.read_bytes(), ib_eml.name)
    assert len(drafts) == 1
    d = drafts[0]
    assert d.ticket_type == "flight"
    assert "IB3166" in d.title
    assert "MAD" in d.title and "SVQ" in d.title
    assert d.reference_code == "IB1234"
    assert d.metadata.get("flight_departure_hour") == "10:00"

    # 2. Ryanair TXT confirmation
    ry_txt = f_dir / "ryanair_flight_confirmation.txt"
    drafts, _ = await scan_travel_document(ry_txt.read_bytes(), ry_txt.name)
    assert len(drafts) == 1
    d = drafts[0]
    assert d.ticket_type == "flight"
    assert "FR1182" in d.title
    assert "STN" in d.title and "MAD" in d.title
    assert d.reference_code == "FR98421"

    # 3. British Airways EML receipt
    ba_eml = f_dir / "british_airways_receipt.eml"
    drafts, _ = await scan_travel_document(ba_eml.read_bytes(), ba_eml.name)
    assert len(drafts) == 1
    d = drafts[0]
    assert d.ticket_type == "flight"
    assert "BA1234" in d.title
    assert d.reference_code == "XYZ123"

    # 4. Lufthansa PDF e-ticket
    lh_pdf = f_dir / "lufthansa_eticket_receipt.pdf"
    drafts, _ = await scan_travel_document(lh_pdf.read_bytes(), lh_pdf.name)
    assert len(drafts) == 1
    d = drafts[0]
    assert d.ticket_type == "flight"
    assert d.reference_code == "LH7721"


@pytest.mark.asyncio
async def test_scan_api_endpoint_with_real_documents(async_client: AsyncClient):
    """Verify POST /api/v1/trips/{trip_id}/tickets/scan endpoint with real documents."""
    # Create trip
    trip_res = await async_client.post(
        "/api/v1/trips/",
        json={
            "destination": "Sevilla",
            "start_date": "2026-10-18T10:00:00",
            "end_date": "2026-10-23T15:00:00",
            "itinerary_data": {"days": []},
        },
    )
    assert trip_res.status_code == 201
    trip_id = trip_res.json()["id"]

    # 1. Scan Iberia PKPASS
    pkpass_path = FIXTURES_DIR / "boarding_passes" / "boarding_pass_iberia.pkpass"
    with open(pkpass_path, "rb") as f:
        scan_res = await async_client.post(
            f"/api/v1/trips/{trip_id}/tickets/scan",
            files={
                "file": (pkpass_path.name, f.read(), "application/vnd.apple.pkpass")
            },
        )
    assert scan_res.status_code == 200
    data = scan_res.json()
    assert len(data["drafts"]) == 1
    draft = data["drafts"][0]
    assert draft["ticket_type"] == "flight"
    assert "IB3166" in draft["title"]
    assert draft["reference_code"] == "IB1234"
    assert data["upload_id"] is not None

    # 2. Scan Booking.com confirmation email
    eml_path = FIXTURES_DIR / "hotel_confirmations" / "booking_com_confirmation.eml"
    with open(eml_path, "rb") as f:
        scan_res_eml = await async_client.post(
            f"/api/v1/trips/{trip_id}/tickets/scan",
            files={"file": (eml_path.name, f.read(), "message/rfc822")},
        )
    assert scan_res_eml.status_code == 200
    eml_data = scan_res_eml.json()
    assert len(eml_data["drafts"]) == 1
    d_hotel = eml_data["drafts"][0]
    assert d_hotel["ticket_type"] == "hotel"
    assert d_hotel["reference_code"] == "BK-9842104"
    assert d_hotel["access_code"] == "4921"
