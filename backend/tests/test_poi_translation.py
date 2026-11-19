from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from app.db.models import AttractionModel
from app.services.translation_service import (
    TranslationError,
    TranslationResult,
    TranslationService,
    detect_language,
    normalize_target_lang,
)
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


def test_detect_language_handles_scripts_and_parentheticals():
    assert (
        detect_language(
            "Gaysorn Amarin, previously known as Amarin Plaza (อัมรินทร์พลาซ่า), is a shopping mall and office building complex located in the Ratchaprasong shopping district in the city centre of Bangkok."
        )
        == "en"
    )
    assert (
        detect_language(
            "El Museo del Prado es uno de los museos más importantes del mundo, ubicado en el centro de Madrid."
        )
        == "es"
    )
    assert (
        detect_language(
            "Le musée du Louvre est un musée situé dans le 1er arrondissement de Paris, sur la rive droite de la Seine."
        )
        == "fr"
    )
    assert (
        detect_language(
            "Das Brandenburger Tor ist ein frühklassizistisches Triumphtor in Berlin und ein bekanntes Wahrzeichen."
        )
        == "de"
    )
    assert (
        detect_language("東京タワーは東京都港区芝公園にある総合電波塔である。") == "ja"
    )
    assert (
        detect_language("故宫博物院位于北京市中心，是中国明清两代的皇家宫殿。") == "zh"
    )
    assert (
        detect_language("경복궁은 서울특별시 종로구에 위치한 조선 시대의 법궁이다.")
        == "ko"
    )
    assert (
        detect_language("برج خليفة هو ناطحة سحاب تقع في إمارة دبي بالإمارات.") == "ar"
    )


def test_normalize_target_lang():
    assert normalize_target_lang("zh-CN") == "zh-CN"
    assert normalize_target_lang("zh") == "zh-CN"
    assert normalize_target_lang("es-ES") == "es"
    assert normalize_target_lang("en-US") == "en"


@pytest.mark.asyncio
async def test_translation_validation_rejects_error_banners():
    with (
        patch.object(
            TranslationService,
            "_translate_via_google_gtx",
            new=AsyncMock(
                return_value=(
                    "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS",
                    "en",
                )
            ),
        ),
        patch.object(
            TranslationService,
            "_translate_via_mymemory",
            new=AsyncMock(return_value=None),
        ),
    ):
        # Simulate _validate_translation catching banner inside gtx / direct validation
        from app.services.translation_service import _validate_translation

        with pytest.raises(TranslationError):
            _validate_translation(
                "A famous landmark in Bangkok.",
                "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS",
            )
        with pytest.raises(TranslationError):
            _validate_translation(
                "A famous landmark in Bangkok.",
                "<!DOCTYPE html><html><body>429 Too Many Requests</body></html>",
            )


@pytest.mark.asyncio
async def test_translate_poi_description_caches_in_postgres(
    async_client: AsyncClient, db_session: AsyncSession
):
    poi_id = f"OSM-node-translate-{uuid4().hex[:8]}"
    poi = AttractionModel(
        id=poi_id,
        city="Bangkok",
        name="Gaysorn Amarin",
        category="shopping",
        cost_eur=0.0,
        cost_is_estimated=False,
        duration_mins=45,
        open_time_mins_by_day=[600] * 7,
        close_time_mins_by_day=[1320] * 7,
        location={"latitude": 13.7435, "longitude": 100.5413},
        scoring={"rating": 4.4, "reviews": 300},
        description="Gaysorn Amarin is a shopping mall and office complex in Bangkok.",
        metadata_field={"source": "osm", "tags": {"shop": "mall"}},
    )
    db_session.add(poi)
    await db_session.commit()

    translated_es = (
        "Gaysorn Amarin es un centro comercial y complejo de oficinas en Bangkok."
    )
    try:
        with patch(
            "app.services.translation_service.TranslationService.translate_text",
            new=AsyncMock(
                return_value=TranslationResult(
                    translated_text=translated_es,
                    source_lang="en",
                    target_lang="es",
                    provider="google_translate",
                )
            ),
        ) as mock_translate:
            res1 = await async_client.post(
                f"/api/pois/{poi_id}/translate",
                json={"target_lang": "es"},
            )
            assert res1.status_code == 200
            data1 = res1.json()
            assert data1["translated_text"] == translated_es
            assert data1["provider"] == "google_translate"
            assert data1["cached"] is False
            mock_translate.assert_awaited_once()

            # Second call should serve from PostgreSQL cache without calling translate_text
            res2 = await async_client.post(
                f"/api/pois/{poi_id}/translate",
                json={"target_lang": "es"},
            )
            assert res2.status_code == 200
            data2 = res2.json()
            assert data2["translated_text"] == translated_es
            assert data2["provider"] == "cache"
            assert data2["cached"] is True
            mock_translate.assert_awaited_once()
    finally:
        await db_session.delete(poi)
        await db_session.commit()


@pytest.mark.asyncio
async def test_translate_poi_failure_returns_503(async_client: AsyncClient):
    with patch(
        "app.services.translation_service.TranslationService.translate_text",
        new=AsyncMock(side_effect=TranslationError("Upstream 429")),
    ):
        res = await async_client.post(
            "/api/pois/OSM-way-transient-999/translate",
            json={
                "target_lang": "es",
                "text": "Gaysorn Amarin is a shopping mall located in Bangkok.",
            },
        )
        assert res.status_code == 503
        assert "429" in res.json()["detail"]


@pytest.mark.asyncio
async def test_get_poi_details_does_not_poison_canonical_english_description(
    async_client: AsyncClient, db_session: AsyncSession
):
    poi_id = f"OSM-node-nopoison-{uuid4().hex[:8]}"
    custom_photo = [
        {
            "url": "https://example.com/custom.jpg",
            "thumbnail_url": "https://example.com/custom_thumb.jpg",
            "caption": "Custom photo",
        }
    ]
    poi = AttractionModel(
        id=poi_id,
        city="Madrid",
        name="Palacio de Cristal Test",
        category="landmark",
        cost_eur=0.0,
        cost_is_estimated=False,
        duration_mins=45,
        open_time_mins_by_day=[600] * 7,
        close_time_mins_by_day=[1320] * 7,
        location={"latitude": 40.4135, "longitude": -3.6821},
        scoring={},
        description=None,
        metadata_field={"source": "osm", "photos": custom_photo, "tags": {}},
    )
    db_session.add(poi)
    await db_session.commit()

    spanish_extract = "El Palacio de Cristal del Retiro es una estructura de metal y cristal situada en Madrid."
    try:
        with patch(
            "app.services.wikimedia_photo_resolver.WikimediaPhotoResolver.resolve_photos",
            new=AsyncMock(return_value=([], spanish_extract)),
        ):
            res = await async_client.get(f"/api/pois/{poi_id}?lang=es")
            assert res.status_code == 200
            data = res.json()
            assert data["description"] == spanish_extract
            assert data["description_lang"] == "es"
            # Custom photo was preserved while Wikipedia still resolved localized text
            assert data["photos"][0]["url"] == "https://example.com/custom.jpg"

        await db_session.refresh(poi)
        # Canonical English column must remain None (not poisoned with Spanish text)
        assert poi.description is None
        assert poi.metadata_field["tags"]["description:es"] == spanish_extract
    finally:
        await db_session.delete(poi)
        await db_session.commit()
