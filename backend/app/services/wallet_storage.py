import hashlib
import os
import shutil
import uuid
from pathlib import Path

from app.db.models import TripTicketAttachmentModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

STORAGE_BASE_DIR = Path(
    os.getenv("WALLET_STORAGE_DIR", "data/wallet_attachments")
).resolve()
TEMP_STORAGE_DIR = (STORAGE_BASE_DIR / "temp").resolve()

# Ensure directories exist
STORAGE_BASE_DIR.mkdir(parents=True, exist_ok=True)
TEMP_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


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


def calculate_sha256(data: bytes) -> str:
    h = hashlib.sha256()
    h.update(data)
    return h.hexdigest()


async def save_temp_upload(content: bytes, filename: str, mime_type: str) -> str:
    upload_id = str(uuid.uuid4())
    temp_dir = _safe_join(TEMP_STORAGE_DIR, upload_id)
    temp_dir.mkdir(parents=True, exist_ok=True)

    safe_name = os.path.basename(filename) or "upload.bin"
    file_path = _safe_join(temp_dir, safe_name)
    file_path.write_bytes(content)

    meta_path = _safe_join(temp_dir, "meta.txt")
    meta_path.write_text(f"{mime_type}\n{safe_name}", encoding="utf-8")
    return upload_id


async def get_temp_upload(upload_id: str) -> tuple[bytes, str, str] | None:
    try:
        temp_dir = _safe_join(TEMP_STORAGE_DIR, upload_id)
    except ValueError:
        return None

    if not temp_dir.exists() or not temp_dir.is_dir():
        return None

    meta_path = _safe_join(temp_dir, "meta.txt")
    if not meta_path.exists():
        return None

    lines = meta_path.read_text(encoding="utf-8").splitlines()
    mime_type = lines[0] if len(lines) > 0 else "application/octet-stream"
    raw_filename = lines[1] if len(lines) > 1 else "document"
    safe_filename = os.path.basename(raw_filename)

    file_path = _safe_join(temp_dir, safe_filename)
    if not file_path.exists():
        return None

    return file_path.read_bytes(), safe_filename, mime_type


async def promote_temp_upload(
    upload_id: str, ticket_id: str, session: AsyncSession
) -> TripTicketAttachmentModel | None:
    temp_data = await get_temp_upload(upload_id)
    if not temp_data:
        return None

    content, filename, mime_type = temp_data
    sha = calculate_sha256(content)
    size_bytes = len(content)

    ticket_dir = _safe_join(STORAGE_BASE_DIR, ticket_id)
    ticket_dir.mkdir(parents=True, exist_ok=True)

    att_id = str(uuid.uuid4())
    ext = Path(filename).suffix
    storage_filename = f"{att_id}{ext}"
    final_path = _safe_join(ticket_dir, storage_filename)
    final_path.write_bytes(content)

    # Cleanup temp directory
    try:
        temp_dir = _safe_join(TEMP_STORAGE_DIR, upload_id)
        if temp_dir.exists() and temp_dir.is_dir():
            shutil.rmtree(temp_dir, ignore_errors=True)
    except ValueError:
        pass

    attachment = TripTicketAttachmentModel(
        id=att_id,
        ticket_id=ticket_id,
        filename=os.path.basename(filename),
        mime_type=mime_type,
        size_bytes=size_bytes,
        sha256=sha,
        storage_path=str(final_path),
    )
    session.add(attachment)
    await session.commit()
    await session.refresh(attachment)
    return attachment


async def save_ticket_attachment(
    ticket_id: str, content: bytes, filename: str, mime_type: str, session: AsyncSession
) -> TripTicketAttachmentModel:
    sha = calculate_sha256(content)
    size_bytes = len(content)

    ticket_dir = _safe_join(STORAGE_BASE_DIR, ticket_id)
    ticket_dir.mkdir(parents=True, exist_ok=True)

    att_id = str(uuid.uuid4())
    ext = Path(filename).suffix
    storage_filename = f"{att_id}{ext}"
    final_path = _safe_join(ticket_dir, storage_filename)
    final_path.write_bytes(content)

    attachment = TripTicketAttachmentModel(
        id=att_id,
        ticket_id=ticket_id,
        filename=os.path.basename(filename),
        mime_type=mime_type,
        size_bytes=size_bytes,
        sha256=sha,
        storage_path=str(final_path),
    )
    session.add(attachment)
    await session.commit()
    await session.refresh(attachment)
    return attachment


async def delete_ticket_attachments_files(
    ticket_id: str, session: AsyncSession
) -> None:
    stmt = select(TripTicketAttachmentModel).where(
        TripTicketAttachmentModel.ticket_id == ticket_id
    )
    res = await session.execute(stmt)
    attachments = res.scalars().all()
    base_path = os.path.abspath(str(STORAGE_BASE_DIR))
    for att in attachments:
        try:
            if att.storage_path:
                norm_path = os.path.normpath(att.storage_path)
                if norm_path.startswith(base_path + os.sep):
                    p = Path(norm_path)
                    if p.exists() and p.is_file():
                        p.unlink()
        except Exception:
            pass

    try:
        ticket_dir = _safe_join(STORAGE_BASE_DIR, ticket_id)
        if ticket_dir.exists() and ticket_dir.is_dir():
            shutil.rmtree(ticket_dir, ignore_errors=True)
    except ValueError:
        pass
