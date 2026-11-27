import io
import logging
import os
import struct
import uuid
from pathlib import Path
from typing import Any

from app.core.paths import resolve_runtime_data_dir
from PIL import Image

logger = logging.getLogger(__name__)

STORAGE_BASE_DIR = Path(
    os.getenv("PHOTO_STORAGE_DIR") or (resolve_runtime_data_dir() / "trip_photos")
).resolve()

STORAGE_BASE_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".m4v", ".ogv"}
ALLOWED_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS

IMAGE_MIME_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif",
    ".bmp": "image/bmp",
}

VIDEO_MIME_MAP = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".m4v": "video/mp4",
    ".ogv": "video/ogg",
}

ALL_MIME_MAP = {**IMAGE_MIME_MAP, **VIDEO_MIME_MAP}


def _parse_mp4_box(data: bytes) -> tuple[int, int] | None:
    offset = 0
    length = len(data)
    while offset < length - 8:
        try:
            (size,) = struct.unpack(">I", data[offset : offset + 4])
            atom_type = data[offset + 4 : offset + 8]
        except struct.error:
            break

        if size == 0:
            break
        if size == 1:
            if offset + 16 > length:
                break
            (size,) = struct.unpack(">Q", data[offset + 8 : offset + 16])
            atom_header = 16
        else:
            atom_header = 8

        if size < atom_header or offset + size > length:
            break

        if atom_type in (b"moov", b"trak", b"mdia"):
            res = _parse_mp4_box(data[offset + atom_header : offset + size])
            if res:
                return res
        elif atom_type == b"tkhd":
            tkhd = data[offset + atom_header : offset + size]
            if len(tkhd) >= 1:
                version = tkhd[0]
                if version == 0 and len(tkhd) >= 84:
                    (w,) = struct.unpack(">I", tkhd[76:80])
                    (h,) = struct.unpack(">I", tkhd[80:84])
                    width, height = w >> 16, h >> 16
                    if width > 0 and height > 0:
                        return width, height
                elif version == 1 and len(tkhd) >= 96:
                    (w,) = struct.unpack(">I", tkhd[88:92])
                    (h,) = struct.unpack(">I", tkhd[92:96])
                    width, height = w >> 16, h >> 16
                    if width > 0 and height > 0:
                        return width, height
        offset += size
    return None


def _parse_mp4_dimensions(content: bytes) -> tuple[int, int] | None:
    """Extract width and height from an MP4/MOV bitstream without external binaries."""
    try:
        return _parse_mp4_box(content)
    except Exception as e:
        logger.debug(f"Failed to parse MP4 dimensions: {e}")
        return None


def _safe_join(base_dir: str | Path, *parts: str) -> Path:
    """
    Safely join paths, stripping path traversal sequences and enforcing
    that the normalized path remains strictly within base_dir.
    """
    base_path = os.path.abspath(str(base_dir))
    safe_parts = [os.path.basename(p.strip()) for p in parts if p and p.strip()]
    fullpath = os.path.normpath(os.path.join(base_path, *safe_parts))
    if not fullpath.startswith(base_path + os.sep) and fullpath != base_path:
        raise ValueError("Path traversal attempt detected")
    return Path(fullpath)


def get_trip_storage_dir(trip_id: str) -> Path:
    trip_dir = _safe_join(STORAGE_BASE_DIR, trip_id)
    trip_dir.mkdir(parents=True, exist_ok=True)
    return trip_dir


async def save_trip_photo(
    trip_id: str,
    content: bytes,
    original_filename: str,
    mime_type: str,
) -> dict[str, Any]:
    """
    Saves an uploaded photo or video into the trip storage folder, detects dimensions
    (via Pillow for images or MP4 header parsing for videos), and returns metadata.
    """
    ext = os.path.splitext(original_filename)[1].lower()
    if not ext or ext not in ALLOWED_EXTENSIONS:
        ext = ".jpg"

    is_video = ext in ALLOWED_VIDEO_EXTENSIONS or (
        mime_type and mime_type.startswith("video/")
    )
    media_type = "video" if is_video else "image"

    photo_id = str(uuid.uuid4())
    safe_file_name = f"{photo_id}{ext}"

    trip_dir = get_trip_storage_dir(trip_id)
    file_path = _safe_join(trip_dir, safe_file_name)
    file_path.write_bytes(content)

    resolved_mime = mime_type
    if not resolved_mime or resolved_mime in ("application/octet-stream", ""):
        resolved_mime = ALL_MIME_MAP.get(ext, "video/mp4" if is_video else "image/jpeg")

    width = 1920 if is_video else 1200
    height = 1080 if is_video else 800

    if is_video:
        parsed_dims = _parse_mp4_dimensions(content)
        if parsed_dims:
            width, height = parsed_dims
    else:
        try:
            with Image.open(io.BytesIO(content)) as img:
                width, height = img.size
        except Exception as e:
            logger.warning(
                f"Could not read image dimensions for {original_filename}: {e}"
            )

    aspect_ratio = round(width / max(1, height), 3)

    return {
        "id": photo_id,
        "url": f"/api/trips/{trip_id}/photos/{photo_id}",
        "filename": original_filename,
        "width": width,
        "height": height,
        "aspect_ratio": aspect_ratio,
        "size_bytes": len(content),
        "mime_type": resolved_mime,
        "media_type": media_type,
        "file_path": str(file_path),
    }


def find_photo_file(trip_id: str, photo_id: str) -> tuple[Path, str] | None:
    """
    Finds the stored photo or video file for a given trip_id and photo_id.
    Returns (Path, mime_type) or None if not found.
    """
    try:
        trip_dir = _safe_join(STORAGE_BASE_DIR, trip_id)
    except ValueError:
        return None

    if not trip_dir.exists():
        return None

    for f in trip_dir.iterdir():
        if f.is_file() and f.stem == photo_id:
            ext = f.suffix.lower()
            return f, ALL_MIME_MAP.get(ext, "application/octet-stream")

    return None


def delete_photo_file(trip_id: str, photo_id: str) -> bool:
    """
    Deletes the photo file from disk if it exists.
    """
    found = find_photo_file(trip_id, photo_id)
    if not found:
        return False
    path, _ = found
    try:
        path.unlink(missing_ok=True)
        return True
    except Exception as e:
        logger.error(f"Failed to delete photo file {path}: {e}")
        return False
