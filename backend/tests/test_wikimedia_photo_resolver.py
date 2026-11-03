"""Unit tests for universal WikimediaPhotoResolver photo and info resolution."""

import pytest
from app.services.wikimedia_photo_resolver import (
    WikimediaPhotoResolver,
    _is_direct_image_url,
    _is_junk_commons_image,
    _is_title_relevant,
)


def test_is_direct_image_url_rejects_share_and_album_pages():
    # Google Photos share links (frequently seen in OSM)
    assert not _is_direct_image_url("https://photos.app.goo.gl/GwAHSWpCCjqHtBMK6")
    assert not _is_direct_image_url("https://photos.google.com/share/AF1QipN")

    # Flickr photo / album pages
    assert not _is_direct_image_url("https://www.flickr.com/photos/user/123456789")

    # Commons wiki page links (not direct CDN URLs)
    assert not _is_direct_image_url(
        "https://commons.wikimedia.org/wiki/File:Shimizu-mon1.jpg"
    )

    # Social and review sites
    assert not _is_direct_image_url("https://www.instagram.com/p/Cxyz123/")
    assert not _is_direct_image_url(
        "https://www.tripadvisor.com/ShowUserReviews-g1-d123.html"
    )

    # Empty or non-http
    assert not _is_direct_image_url(None)
    assert not _is_direct_image_url("")
    assert not _is_direct_image_url("ftp://example.com/img.jpg")


def test_is_direct_image_url_accepts_valid_image_formats():
    assert _is_direct_image_url(
        "https://upload.wikimedia.org/wikipedia/commons/2/23/Shimizu-mon1.jpg"
    )
    assert _is_direct_image_url(
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d8/photo.jpg/330px-photo.jpg?utm_source=test"
    )
    assert _is_direct_image_url("https://example.com/images/exterior.png")
    assert _is_direct_image_url("https://example.com/images/facade.webp")
    assert _is_direct_image_url("https://example.com/images/building.jpeg?v=1.2")


def test_is_title_relevant_rejects_unrelated_and_obscure_matches():
    # Fukuya Azabu vs The Beatles' tour
    assert not _is_title_relevant(
        candidate_title="The Beatles' 1966 tour of Germany, Japan and the Philippines",
        target_name="Fukuya Azabu",
    )

    # Shimizu Gate vs Kana Hanazawa
    assert not _is_title_relevant(
        candidate_title="花澤香菜",
        target_name="Shimizu Gate",
    )

    # Disambiguation / List pages
    assert not _is_title_relevant(
        candidate_title="Tokyo Tower (disambiguation)",
        target_name="Tokyo Tower",
    )
    assert not _is_title_relevant(
        candidate_title="List of restaurants in Tokyo",
        target_name="Fukuya",
    )


def test_is_title_relevant_accepts_genuine_matches():
    # Exact and partial case-insensitive matches
    assert _is_title_relevant("Museo del Prado", "Museo del Prado")
    assert _is_title_relevant(
        "Prado Museum", "Museo del Prado", aliases=["Prado Museum"]
    )
    assert _is_title_relevant("Tokyo Tower", "Tokyo Tower")
    assert _is_title_relevant("Eiffel Tower", "Tour Eiffel", aliases=["Eiffel Tower"])
    assert _is_title_relevant(
        "Kōtoku-in", "Great Buddha of Kamakura", aliases=["Kōtoku-in", "Kotoku-in"]
    )
    assert _is_title_relevant("Shimizu-mon", "Shimizu Gate", aliases=["Shimizu-mon"])


def test_is_junk_commons_image():
    # PDFs, SVGs, maps, diagrams, coats of arms
    assert _is_junk_commons_image(
        "Federal Register 1941.pdf", "https://commons.wikimedia.org/reg.pdf"
    )
    assert _is_junk_commons_image(
        "Metro Map of Tokyo.svg", "https://commons.wikimedia.org/map.svg"
    )
    assert _is_junk_commons_image(
        "Coat of arms of Tokyo.png", "https://commons.wikimedia.org/coat.png"
    )
    assert _is_junk_commons_image(
        "Locator map of Chiyoda.jpg", "https://commons.wikimedia.org/loc.jpg"
    )
    assert _is_junk_commons_image(
        "Floor plan of temple.png", "https://commons.wikimedia.org/plan.png"
    )

    # Real photos should NOT be marked as junk
    assert not _is_junk_commons_image(
        "Shimizu-mon gate exterior.jpg", "https://upload.wikimedia.org/Shimizu-mon.jpg"
    )
    assert not _is_junk_commons_image(
        "Kamakura Daibutsu 2026.jpg", "https://upload.wikimedia.org/Daibutsu.jpg"
    )


@pytest.mark.asyncio
async def test_resolve_photos_rejects_unrelated_search_results():
    """Verifies that Fukuya Azabu does NOT get matched to The Beatles or get Beatles photos."""
    photos, extract = await WikimediaPhotoResolver.resolve_photos(
        poi_id="test_fukuya_unrelated_check",
        name="Fukuya Azabu",
        city="Tokyo",
    )
    # Beatles text and image must NEVER be returned for Fukuya Azabu
    if extract:
        assert "Beatles" not in extract
        assert "rock group" not in extract
    for p in photos:
        assert "Beatles" not in (p.get("caption") or "")
        assert "Beatles" not in (p.get("url") or "")


@pytest.mark.asyncio
async def test_resolve_photos_uses_osm_tag_intelligence_for_shimizu_gate():
    """Verifies that Shimizu Gate resolves to the authentic gate, not Kana Hanazawa."""
    photos, extract = await WikimediaPhotoResolver.resolve_photos(
        poi_id="test_shimizu_gate_check",
        name="Shimizu Gate",
        city="Tokyo",
        osm_tags={
            "name": "清水門",
            "wikipedia": "ja:清水門",
            "wikidata": "Q28685861",
            "name:en": "Shimizu Gate",
        },
    )
    # Kana Hanazawa must NOT be in photos or extract
    if extract:
        assert "花澤" not in extract
        assert "声優" not in extract
        assert (
            "清水門" in extract
            or "門" in extract
            or "Edo" in extract
            or "Gate" in extract
        )
    for p in photos:
        assert "Hanazawa" not in (p.get("url") or "")
        assert "Hanazawa" not in (p.get("caption") or "")
    assert len(photos) > 0
    assert "Shimizu" in photos[0]["url"]


@pytest.mark.asyncio
async def test_resolve_photos_filters_broken_osm_share_links():
    """Verifies that Google Photos album links are filtered and authentic statue photos used."""
    photos, extract = await WikimediaPhotoResolver.resolve_photos(
        poi_id="test_great_buddha_share_link_check",
        name="Great Buddha of Kamakura",
        city="Tokyo",
        osm_tags={
            "name": "鎌倉大仏",
            "image": "https://photos.app.goo.gl/GwAHSWpCCjqHtBMK6",
            "wikidata": "Q106582187",
            "wikipedia": "ja:鎌倉大仏",
            "name:en": "Great Buddha of Kamakura",
        },
    )
    # First photo must NOT be the google photos share link!
    assert len(photos) > 0
    assert not photos[0]["url"].startswith("https://photos.app.goo.gl")
    import urllib.parse

    p_path = urllib.parse.urlparse(photos[0]["url"]).path.lower()
    assert any(p_path.endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp"))
    if extract:
        assert "Kōtoku-in" in extract or "temple" in extract or "大仏" in extract
