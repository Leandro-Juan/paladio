import io
import uuid
import pytest
from PIL import Image
from httpx import AsyncClient


def _create_test_image_bytes(
    width: int, height: int, color="blue", format="JPEG"
) -> bytes:
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()


@pytest.mark.asyncio
async def test_trip_photos_lifecycle(async_client: AsyncClient):
    uid = uuid.uuid4().hex[:8]

    # 1. Register a test user
    res_reg = await async_client.post(
        "/api/auth/register",
        json={
            "email": f"photo_user_{uid}@paladio.com",
            "username": f"photo_user_{uid}",
            "password": "passwordPhotos123",
        },
    )
    assert res_reg.status_code == 201, res_reg.text
    token = res_reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create a test trip
    create_trip_res = await async_client.post(
        "/api/trips/",
        json={
            "destination": "Kyoto",
            "start_date": "2026-11-01",
            "end_date": "2026-11-07",
            "itinerary_data": {"days": []},
        },
        headers=headers,
    )
    assert create_trip_res.status_code == 201
    trip_id = create_trip_res.json()["id"]

    # 3. Create test images with different aspect ratios
    # Landscape 1920x1080 (16:9, ar=1.778)
    landscape_bytes = _create_test_image_bytes(1920, 1080, color="green")
    # Portrait 800x1200 (2:3, ar=0.667)
    portrait_bytes = _create_test_image_bytes(800, 1200, color="red")

    files = [
        ("files", ("fushimi_inari.jpg", landscape_bytes, "image/jpeg")),
        ("files", ("bamboo_grove.jpg", portrait_bytes, "image/jpeg")),
    ]

    # 4. Upload photos to trip
    upload_res = await async_client.post(
        f"/api/trips/{trip_id}/photos",
        files=files,
        headers=headers,
    )
    assert upload_res.status_code == 200, upload_res.text
    uploaded_items = upload_res.json()
    assert len(uploaded_items) == 2

    photo1 = uploaded_items[0]
    photo2 = uploaded_items[1]

    assert photo1["filename"] == "fushimi_inari.jpg"
    assert photo1["width"] == 1920
    assert photo1["height"] == 1080
    assert abs(photo1["aspect_ratio"] - 1.778) < 0.01

    assert photo2["filename"] == "bamboo_grove.jpg"
    assert photo2["width"] == 800
    assert photo2["height"] == 1200
    assert abs(photo2["aspect_ratio"] - 0.667) < 0.01

    # 5. Fetch photo 1 via GET streaming endpoint
    get_res = await async_client.get(photo1["url"])
    assert get_res.status_code == 200
    assert get_res.headers["content-type"].startswith("image/jpeg")
    assert len(get_res.content) == len(landscape_bytes)

    # 6. Verify trip itinerary_data contains photos
    trip_get = await async_client.get(f"/api/trips/{trip_id}", headers=headers)
    assert trip_get.status_code == 200
    itin = trip_get.json()["itinerary_data"]
    assert "photos" in itin
    assert len(itin["photos"]) == 2

    # 7. Delete photo 1
    del_res = await async_client.delete(
        f"/api/trips/{trip_id}/photos/{photo1['id']}",
        headers=headers,
    )
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "ok"

    # 8. Verify photo 1 is removed from itinerary_data
    trip_get2 = await async_client.get(f"/api/trips/{trip_id}", headers=headers)
    assert trip_get2.status_code == 200
    itin2 = trip_get2.json()["itinerary_data"]
    assert len(itin2["photos"]) == 1
    assert itin2["photos"][0]["id"] == photo2["id"]

    # 9. Verify GET for deleted photo 1 returns 404
    get_del = await async_client.get(photo1["url"])
    assert get_del.status_code == 404
