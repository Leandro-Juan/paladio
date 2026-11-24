import hashlib
import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from app.db.models import SystemConfigModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

logger = logging.getLogger(__name__)

CONFIG_KEY = "updater"
DEFAULT_GITHUB_REPO = os.getenv("GITHUB_REPO", "Leandro-Juan/paladio")


def set_record_value(record: SystemConfigModel, val: dict[str, Any]) -> None:
    record.value = dict(val)
    flag_modified(record, "value")


def resolve_project_root() -> Path:
    """Dynamically resolve repository or app root."""
    # Try traversing upwards looking for .release-please-manifest.json or docker-compose.yml
    curr = Path(__file__).resolve().parent
    for _ in range(5):
        if (curr / ".release-please-manifest.json").exists() or (
            curr / "docker-compose.yml"
        ).exists():
            return curr
        curr = curr.parent
    return Path(__file__).resolve().parents[2]


def get_current_installed_version() -> str:
    """Dynamically read the current version from the project manifest or environment."""
    env_ver = os.getenv("APP_VERSION")
    if env_ver:
        return env_ver.lstrip("v").strip()

    root = resolve_project_root()
    manifest = root / ".release-please-manifest.json"
    if manifest.exists():
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
            if "." in data:
                return str(data["."]).lstrip("v").strip()
        except Exception as e:
            logger.warning(f"Failed to read version from manifest: {e}")

    # Fallback to frontend package.json
    frontend_pkg = root / "frontend" / "package.json"
    if frontend_pkg.exists():
        try:
            data = json.loads(frontend_pkg.read_text(encoding="utf-8"))
            if "version" in data:
                return str(data["version"]).lstrip("v").strip()
        except Exception as e:
            logger.warning(f"Failed to read version from frontend package.json: {e}")

    return "3.0.0"


def parse_semver(v: str) -> tuple[int, ...]:
    """Parse a version string like 'v2.1.0' or '2.0.0-rc1' into comparable tuple."""
    cleaned = v.strip().lstrip("v")
    # Extract numeric components
    match = re.match(r"^(\d+)(?:\.(\d+))?(?:\.(\d+))?", cleaned)
    if not match:
        return (0, 0, 0)
    parts = [int(p) if p is not None else 0 for p in match.groups()]
    return tuple(parts)


def is_version_newer(candidate: str, current: str) -> bool:
    """Return True if candidate version is strictly newer than current version."""
    cand_parts = parse_semver(candidate)
    curr_parts = parse_semver(current)
    return cand_parts > curr_parts


def get_updates_directory() -> Path:
    """Determine updates directory path and ensure it exists."""
    custom_dir = os.getenv("PALADIO_UPDATES_DIR")
    if custom_dir:
        path = Path(custom_dir)
    else:
        root = resolve_project_root()
        path = root / "data" / "updates"

    try:
        path.mkdir(parents=True, exist_ok=True)
    except Exception:
        path = Path("/tmp/paladio_updates")
        path.mkdir(parents=True, exist_ok=True)
    return path


class UpdaterService:
    @staticmethod
    async def get_state(session: AsyncSession) -> dict[str, Any]:
        """Fetch or initialize the current auto-updater state from PostgreSQL."""
        stmt = select(SystemConfigModel).where(SystemConfigModel.key == CONFIG_KEY)
        result = await session.execute(stmt)
        record = result.scalar_one_or_none()

        current_ver = get_current_installed_version()

        if record is None:
            defaults = {
                "auto_update_enabled": False,
                "check_interval_hours": 6,
                "github_repo": DEFAULT_GITHUB_REPO,
                "last_checked_at": None,
                "current_version": current_ver,
                "latest_version": current_ver,
                "update_available": False,
                "release_title": None,
                "release_notes": None,
                "release_url": None,
                "download_url": None,
                "download_status": "idle",
                "downloaded_file": None,
                "downloaded_at": None,
                "file_sha256": None,
                "file_size_bytes": None,
                "last_error": None,
            }
            record = SystemConfigModel(key=CONFIG_KEY, value=defaults)
            session.add(record)
            await session.commit()
            await session.refresh(record)
            return dict(record.value)

        val = dict(record.value or {})
        # Keep current_version synchronized dynamically
        if val.get("current_version") != current_ver:
            val["current_version"] = current_ver
            set_record_value(record, val)
            await session.commit()
            await session.refresh(record)

        return val

    @staticmethod
    async def update_config(
        session: AsyncSession,
        auto_update_enabled: bool | None = None,
        check_interval_hours: int | None = None,
        github_repo: str | None = None,
    ) -> dict[str, Any]:
        """Update system auto-update configuration (e.g. enable or stop automatic updates)."""
        stmt = select(SystemConfigModel).where(SystemConfigModel.key == CONFIG_KEY)
        result = await session.execute(stmt)
        record = result.scalar_one_or_none()

        if record is None:
            await UpdaterService.get_state(session)
            result = await session.execute(stmt)
            record = result.scalar_one_or_none()

        val = dict(record.value or {})

        if auto_update_enabled is not None:
            val["auto_update_enabled"] = bool(auto_update_enabled)
        if check_interval_hours is not None:
            val["check_interval_hours"] = max(1, int(check_interval_hours))
        if github_repo is not None and github_repo.strip():
            val["github_repo"] = github_repo.strip()

        set_record_value(record, val)
        await session.commit()
        await session.refresh(record)
        return dict(record.value)

    @staticmethod
    async def check_for_updates(
        session: AsyncSession,
        force_download: bool = False,
        client: httpx.AsyncClient | None = None,
    ) -> dict[str, Any]:
        """
        Check GitHub repository for the latest release/tag.
        If an update is found and auto_update_enabled (or force_download) is true, download it.
        """
        stmt = select(SystemConfigModel).where(SystemConfigModel.key == CONFIG_KEY)
        result = await session.execute(stmt)
        record = result.scalar_one_or_none()
        if not record:
            await UpdaterService.get_state(session)
            result = await session.execute(stmt)
            record = result.scalar_one_or_none()

        val = dict(record.value or {})
        repo = val.get("github_repo") or DEFAULT_GITHUB_REPO
        current_ver = get_current_installed_version()
        val["current_version"] = current_ver
        val["last_checked_at"] = datetime.now(timezone.utc).isoformat()
        val["last_error"] = None

        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "Paladio-AutoUpdater/2.0",
        }
        gh_token = os.getenv("GITHUB_TOKEN")
        if gh_token:
            headers["Authorization"] = f"Bearer {gh_token}"

        api_url = f"https://api.github.com/repos/{repo}/releases/latest"

        close_client = False
        if client is None:
            client = httpx.AsyncClient(timeout=15.0, follow_redirects=True)
            close_client = True

        try:
            resp = await client.get(api_url, headers=headers)
            if resp.status_code == 404:
                # No published release yet, try tags fallback
                tags_url = f"https://api.github.com/repos/{repo}/tags"
                tags_resp = await client.get(tags_url, headers=headers)
                tags_resp.raise_for_status()
                tags_data = tags_resp.json()
                if not tags_data:
                    val["latest_version"] = current_ver
                    val["update_available"] = False
                    val["download_status"] = "idle"
                    set_record_value(record, val)
                    await session.commit()
                    return val

                latest_tag_name = tags_data[0]["name"]
                tarball_url = (
                    tags_data[0].get("tarball_url")
                    or f"https://github.com/{repo}/archive/refs/tags/{latest_tag_name}.tar.gz"
                )
                candidate_version = latest_tag_name.lstrip("v").strip()

                val["latest_version"] = candidate_version
                val["release_title"] = f"Release {latest_tag_name}"
                val["release_notes"] = (
                    f"Latest tagged release {latest_tag_name} on {repo}"
                )
                val["release_url"] = (
                    f"https://github.com/{repo}/releases/tag/{latest_tag_name}"
                )
                val["download_url"] = tarball_url
            else:
                resp.raise_for_status()
                release_data = resp.json()
                tag_name = release_data.get("tag_name") or release_data.get("name", "")
                candidate_version = tag_name.lstrip("v").strip()

                val["latest_version"] = candidate_version
                val["release_title"] = release_data.get("name") or tag_name
                val["release_notes"] = (
                    release_data.get("body") or "No release notes provided."
                )
                val["release_url"] = release_data.get("html_url")

                # Prefer release asset tarball/zip if available, else tarball_url
                download_url = release_data.get("tarball_url")
                assets = release_data.get("assets", [])
                for asset in assets:
                    asset_url = asset.get("browser_download_url", "")
                    if asset_url.endswith((".tar.gz", ".zip")):
                        download_url = asset_url
                        break
                val["download_url"] = (
                    download_url
                    or f"https://github.com/{repo}/archive/refs/tags/{tag_name}.tar.gz"
                )

            newer = is_version_newer(val["latest_version"], current_ver)
            val["update_available"] = newer

            if newer:
                # Check if automatic updates are enabled or forced
                if val.get("auto_update_enabled", False) or force_download:
                    set_record_value(record, val)
                    await session.commit()
                    return await UpdaterService.download_update(
                        session=session,
                        download_url=val["download_url"],
                        version=val["latest_version"],
                        client=client,
                    )
                else:
                    val["download_status"] = "idle"
            else:
                val["download_status"] = "idle"

            set_record_value(record, val)
            await session.commit()
            await session.refresh(record)
            return dict(record.value)

        except Exception as e:
            logger.exception(f"Error checking GitHub repository updates: {e}")
            val["last_error"] = str(e)
            val["download_status"] = "failed"
            set_record_value(record, val)
            await session.commit()
            return val
        finally:
            if close_client:
                await client.aclose()

    @staticmethod
    async def download_update(
        session: AsyncSession,
        download_url: str | None = None,
        version: str | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> dict[str, Any]:
        """Download update archive from GitHub into local updates directory."""
        stmt = select(SystemConfigModel).where(SystemConfigModel.key == CONFIG_KEY)
        result = await session.execute(stmt)
        record = result.scalar_one_or_none()
        if not record:
            await UpdaterService.get_state(session)
            result = await session.execute(stmt)
            record = result.scalar_one_or_none()

        val = dict(record.value or {})
        target_url = download_url or val.get("download_url")
        target_version = version or val.get("latest_version") or "latest"

        if not target_url:
            val["last_error"] = (
                "No download URL available. Please check for updates first."
            )
            val["download_status"] = "failed"
            set_record_value(record, val)
            await session.commit()
            return val

        # Set downloading status and commit so UI immediately reflects it
        val["download_status"] = "downloading"
        val["last_error"] = None
        set_record_value(record, val)
        await session.commit()

        close_client = False
        if client is None:
            client = httpx.AsyncClient(follow_redirects=True, timeout=60.0)
            close_client = True

        try:
            updates_dir = get_updates_directory()
            safe_ver = re.sub(r"[^a-zA-Z0-9_\.-]", "_", str(target_version))
            ext = (
                ".tar.gz"
                if ".tar.gz" in target_url
                else ".zip"
                if ".zip" in target_url
                else ".tar.gz"
            )
            dest_file = updates_dir / f"paladio-{safe_ver}{ext}"

            sha256_hash = hashlib.sha256()
            total_bytes = 0

            headers = {
                "User-Agent": "Paladio-AutoUpdater/2.0",
                "Accept": "application/vnd.github+json, application/octet-stream, */*",
            }
            gh_token = os.getenv("GITHUB_TOKEN")
            if gh_token:
                headers["Authorization"] = f"Bearer {gh_token}"

            async with client.stream(
                "GET", target_url, headers=headers, follow_redirects=True
            ) as stream_resp:
                stream_resp.raise_for_status()
                with open(dest_file, "wb") as f:
                    async for chunk in stream_resp.aiter_bytes(chunk_size=65536):
                        if chunk:
                            f.write(chunk)
                            sha256_hash.update(chunk)
                            total_bytes += len(chunk)

            if total_bytes == 0:
                raise ValueError("Downloaded file is empty (0 bytes received)")

            val["download_status"] = "downloaded"
            val["downloaded_file"] = str(dest_file)
            val["downloaded_at"] = datetime.now(timezone.utc).isoformat()
            val["file_sha256"] = sha256_hash.hexdigest()
            val["file_size_bytes"] = total_bytes
            val["last_error"] = None

            set_record_value(record, val)
            await session.commit()
            await session.refresh(record)
            logger.info(
                f"Successfully downloaded Paladio update {safe_ver} ({total_bytes} bytes) to {dest_file}"
            )
            return dict(record.value)

        except Exception as e:
            logger.exception(f"Failed to download update: {e}")
            val["download_status"] = "failed"
            val["last_error"] = str(e)
            set_record_value(record, val)
            await session.commit()
            return val
        finally:
            if close_client:
                await client.aclose()
