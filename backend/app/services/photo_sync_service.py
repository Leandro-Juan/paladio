import logging
from datetime import datetime, timezone
from typing import Any
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import TripModel
from app.db.session import async_session
from app.services.photo_storage import find_photo_file
from app.services.settings_service import SettingsService

logger = logging.getLogger(__name__)


class PhotoSyncService:
    @classmethod
    async def get_config(cls, session: AsyncSession) -> dict[str, Any]:
        """Fetch current vault settings containing Immich & Synology configurations."""
        return await SettingsService.get_domain_settings(session, "vault")

    @classmethod
    async def test_immich_connection(cls, url: str, api_key: str) -> dict[str, Any]:
        """Verify authentication and reachability of an Immich instance."""
        if not url:
            return {"success": False, "error": "Immich URL is required"}
        if not api_key:
            return {"success": False, "error": "Immich API Key is required"}

        base_url = url.rstrip("/")
        headers = {"x-api-key": api_key, "Accept": "application/json"}

        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                # Try server-info ping first, fallback to user profile me
                resp = await client.get(
                    f"{base_url}/api/server-info/ping", headers=headers
                )
                if resp.status_code == 200:
                    version = ""
                    try:
                        v_resp = await client.get(
                            f"{base_url}/api/server-info/version", headers=headers
                        )
                        if v_resp.status_code == 200:
                            v_data = v_resp.json()
                            version = f"v{v_data.get('major', '')}.{v_data.get('minor', '')}.{v_data.get('patch', '')}"
                    except Exception:
                        pass
                    msg = f"Immich server connected successfully {version}".strip()
                    return {"success": True, "message": msg}

                user_resp = await client.get(
                    f"{base_url}/api/users/me", headers=headers
                )
                if user_resp.status_code == 200:
                    user_data = user_resp.json()
                    name = user_data.get("name") or user_data.get("email") or "User"
                    return {
                        "success": True,
                        "message": f"Immich authenticated successfully as {name}",
                    }

                return {
                    "success": False,
                    "error": f"Immich returned HTTP {user_resp.status_code}: {user_resp.text[:200]}",
                }
        except Exception as e:
            logger.warning(f"Immich connection test failed: {e}")
            return {"success": False, "error": f"Failed to reach Immich server: {e}"}

    @classmethod
    async def test_synology_connection(
        cls,
        url: str,
        username: str,
        password: str,
        destination_path: str = "/photo/Paladio",
    ) -> dict[str, Any]:
        """Verify authentication and folder reachability on Synology Photos or WebDAV."""
        if not url:
            return {"success": False, "error": "Synology URL is required"}

        base_url = url.rstrip("/")
        auth = httpx.BasicAuth(username, password) if username and password else None

        try:
            async with httpx.AsyncClient(
                timeout=10.0, follow_redirects=True, auth=auth
            ) as client:
                # 1. Attempt WebDAV PROPFIND / check
                prop_resp = await client.request(
                    "PROPFIND",
                    f"{base_url}/{destination_path.lstrip('/')}",
                    headers={"Depth": "0"},
                )
                if prop_resp.status_code in (200, 207):
                    return {
                        "success": True,
                        "message": f"Synology WebDAV folder '{destination_path}' reachable",
                    }
                if prop_resp.status_code == 404:
                    # Folder doesn't exist yet, but server is reachable and auth passed
                    return {
                        "success": True,
                        "message": f"Synology endpoint reached (target folder '{destination_path}' will be created on upload)",
                    }

                # 2. Check Synology DSM Info API
                info_resp = await client.get(
                    f"{base_url}/webapi/entry.cgi?api=SYNO.API.Info&version=1&method=query"
                )
                if info_resp.status_code == 200:
                    return {
                        "success": True,
                        "message": "Synology DSM WebAPI service detected and reachable",
                    }

                # 3. Generic GET root check
                root_resp = await client.get(base_url)
                if root_resp.status_code in (200, 301, 302, 401, 403):
                    if auth and root_resp.status_code not in (401, 403):
                        return {
                            "success": True,
                            "message": f"Synology endpoint connected (HTTP {root_resp.status_code})",
                        }
                    elif not auth:
                        return {
                            "success": True,
                            "message": f"Synology host reachable at {base_url}",
                        }

                return {
                    "success": False,
                    "error": f"Synology returned HTTP {root_resp.status_code if 'root_resp' in locals() else prop_resp.status_code}",
                }
        except Exception as e:
            logger.warning(f"Synology connection test failed: {e}")
            return {
                "success": False,
                "error": f"Failed to reach Synology endpoint: {e}",
            }

    @classmethod
    async def _upload_to_immich(
        cls,
        base_url: str,
        api_key: str,
        album_name: str,
        photo_id: str,
        filename: str,
        mime_type: str,
        file_bytes: bytes,
    ) -> dict[str, Any]:
        """Upload a photo or video to Immich via REST API."""
        headers = {"x-api-key": api_key}
        now_iso = datetime.now(timezone.utc).isoformat()

        files = {
            "assetData": (
                filename or f"{photo_id}.jpg",
                file_bytes,
                mime_type or "image/jpeg",
            ),
        }
        data = {
            "deviceAssetId": photo_id,
            "deviceId": "Paladio-Vault",
            "fileCreatedAt": now_iso,
            "fileModifiedAt": now_iso,
            "isFavorite": "false",
        }

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            upload_url = f"{base_url.rstrip('/')}/api/assets"
            resp = await client.post(
                upload_url, headers=headers, data=data, files=files
            )
            if resp.status_code not in (200, 201):
                err_text = resp.text[:200]
                raise RuntimeError(
                    f"Immich upload failed (HTTP {resp.status_code}): {err_text}"
                )

            result = resp.json()
            asset_id = result.get("id")

            # Associate with album if album name specified
            if asset_id and album_name:
                try:
                    await cls._add_to_immich_album(
                        client, base_url, headers, album_name, asset_id
                    )
                except Exception as album_err:
                    logger.warning(
                        f"Failed to add asset {asset_id} to Immich album '{album_name}': {album_err}"
                    )

            return {"provider": "immich", "status": "success", "asset_id": asset_id}

    @classmethod
    async def _add_to_immich_album(
        cls,
        client: httpx.AsyncClient,
        base_url: str,
        headers: dict[str, str],
        album_name: str,
        asset_id: str,
    ) -> None:
        """Find or create target album in Immich and add asset."""
        albums_url = f"{base_url.rstrip('/')}/api/albums"
        albums_resp = await client.get(albums_url, headers=headers)
        target_album_id = None

        if albums_resp.status_code == 200:
            albums = albums_resp.json()
            for alb in albums:
                if (
                    alb.get("albumName", "").strip().lower()
                    == album_name.strip().lower()
                ):
                    target_album_id = alb.get("id")
                    break

        if not target_album_id:
            create_resp = await client.post(
                albums_url, headers=headers, json={"albumName": album_name}
            )
            if create_resp.status_code in (200, 201):
                target_album_id = create_resp.json().get("id")

        if target_album_id:
            put_url = f"{base_url.rstrip('/')}/api/albums/{target_album_id}/assets"
            await client.put(put_url, headers=headers, json={"ids": [asset_id]})

    @classmethod
    async def _upload_to_synology(
        cls,
        base_url: str,
        username: str,
        password: str,
        destination_path: str,
        photo_id: str,
        filename: str,
        mime_type: str,
        file_bytes: bytes,
    ) -> dict[str, Any]:
        """Upload a photo or video to Synology Photos or WebDAV destination."""
        clean_base = base_url.rstrip("/")
        clean_dest = destination_path.strip("/")
        auth = httpx.BasicAuth(username, password) if username and password else None

        safe_filename = filename or f"{photo_id}.jpg"
        target_url = f"{clean_base}/{clean_dest}/{safe_filename}"

        headers = {
            "Content-Type": mime_type or "application/octet-stream",
        }

        async with httpx.AsyncClient(
            timeout=30.0, follow_redirects=True, auth=auth
        ) as client:
            # First attempt: WebDAV PUT
            put_resp = await client.put(target_url, headers=headers, content=file_bytes)
            if put_resp.status_code in (200, 201, 204):
                return {
                    "provider": "synology",
                    "status": "success",
                    "path": f"/{clean_dest}/{safe_filename}",
                }

            # If 404 or 409, directory might not exist yet; try creating parent folder with MKCOL
            if put_resp.status_code in (404, 409):
                parent_url = f"{clean_base}/{clean_dest}"
                try:
                    await client.request("MKCOL", parent_url)
                    retry_resp = await client.put(
                        target_url, headers=headers, content=file_bytes
                    )
                    if retry_resp.status_code in (200, 201, 204):
                        return {
                            "provider": "synology",
                            "status": "success",
                            "path": f"/{clean_dest}/{safe_filename}",
                        }
                except Exception as mkcol_err:
                    logger.debug(f"MKCOL failed on {parent_url}: {mkcol_err}")

            raise RuntimeError(
                f"Synology upload failed (HTTP {put_resp.status_code}): {put_resp.text[:200]}"
            )

    @classmethod
    async def sync_photo(
        cls,
        session: AsyncSession,
        trip_id: str,
        photo_meta: dict[str, Any],
        file_bytes: bytes | None = None,
    ) -> dict[str, Any]:
        """
        Synchronize a single itinerary photo to configured external storage (Immich, Synology).
        Safely captures failures per provider without interrupting the caller.
        """
        config = await cls.get_config(session)
        photo_id = photo_meta.get("id")
        filename = photo_meta.get("filename") or f"{photo_id}.jpg"
        mime_type = photo_meta.get("mime_type") or "image/jpeg"

        # Load file bytes if not supplied in memory
        if file_bytes is None:
            found = find_photo_file(trip_id, photo_id)
            if not found:
                return {
                    "status": "skipped",
                    "reason": f"Photo file not found on disk for {photo_id}",
                }
            path, _ = found
            try:
                file_bytes = path.read_bytes()
            except Exception as read_err:
                return {
                    "status": "error",
                    "reason": f"Could not read photo file: {read_err}",
                }

        results: dict[str, Any] = {}

        # 1. Immich Sync
        if config.get("immich_enabled") and config.get("immich_url"):
            try:
                res = await cls._upload_to_immich(
                    base_url=config["immich_url"],
                    api_key=config.get("immich_api_key", ""),
                    album_name=config.get("immich_album_name", "Paladio Vault"),
                    photo_id=photo_id,
                    filename=filename,
                    mime_type=mime_type,
                    file_bytes=file_bytes,
                )
                results["immich"] = res
            except Exception as err:
                logger.error(f"Immich sync failed for photo {photo_id}: {err}")
                results["immich"] = {"status": "failed", "error": str(err)}

        # 2. Synology Sync
        if config.get("synology_enabled") and config.get("synology_url"):
            try:
                res = await cls._upload_to_synology(
                    base_url=config["synology_url"],
                    username=config.get("synology_username", ""),
                    password=config.get("synology_password", ""),
                    destination_path=config.get(
                        "synology_destination_path", "/photo/Paladio"
                    ),
                    photo_id=photo_id,
                    filename=filename,
                    mime_type=mime_type,
                    file_bytes=file_bytes,
                )
                results["synology"] = res
            except Exception as err:
                logger.error(f"Synology sync failed for photo {photo_id}: {err}")
                results["synology"] = {"status": "failed", "error": str(err)}

        return {
            "status": "completed",
            "photo_id": photo_id,
            "providers": results,
        }

    @classmethod
    async def sync_photo_from_disk_background(
        cls, trip_id: str, photo_meta: dict[str, Any]
    ) -> None:
        """Background task wrapper creating its own async database session."""
        try:
            async with async_session() as session:
                config = await cls.get_config(session)
                if not config.get("sync_on_upload", True):
                    return
                if not config.get("immich_enabled") and not config.get(
                    "synology_enabled"
                ):
                    return
                await cls.sync_photo(session, trip_id, photo_meta)
        except Exception as e:
            logger.exception(f"Background photo sync error for trip {trip_id}: {e}")

    @classmethod
    async def sync_all_vault_photos(
        cls, session: AsyncSession, trip_id: str | None = None
    ) -> dict[str, Any]:
        """
        Scans all vault photos for a specific trip (or all trips) and synchronizes them.
        """
        config = await cls.get_config(session)
        if not config.get("immich_enabled") and not config.get("synology_enabled"):
            return {
                "success": False,
                "error": "Neither Immich nor Synology photo sync is enabled in Vault settings",
            }

        stmt = select(TripModel)
        if trip_id:
            stmt = stmt.where(TripModel.id == trip_id)

        res = await session.execute(stmt)
        trips = res.scalars().all()

        total = 0
        synced_immich = 0
        synced_synology = 0
        failures = 0

        for t in trips:
            itin_data = t.itinerary_data if isinstance(t.itinerary_data, dict) else {}
            photos = itin_data.get("photos", [])
            if not isinstance(photos, list):
                continue

            for p in photos:
                if not isinstance(p, dict):
                    continue
                p_id = p.get("id")
                if not p_id:
                    continue

                total += 1
                outcome = await cls.sync_photo(session, t.id, p)
                providers = outcome.get("providers", {})
                if providers.get("immich", {}).get("status") == "success":
                    synced_immich += 1
                elif (
                    "immich" in providers
                    and providers["immich"].get("status") == "failed"
                ):
                    failures += 1

                if providers.get("synology", {}).get("status") == "success":
                    synced_synology += 1
                elif (
                    "synology" in providers
                    and providers["synology"].get("status") == "failed"
                ):
                    failures += 1

        return {
            "success": True,
            "total_scanned": total,
            "synced_immich": synced_immich,
            "synced_synology": synced_synology,
            "failures": failures,
        }
