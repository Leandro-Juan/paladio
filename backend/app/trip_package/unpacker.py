"""TripUnpacker validating and extracting .trip archives with security guardrails."""

import hashlib
import json
import logging
import zipfile
from pathlib import Path
from typing import Any

from app.trip_package.packager import MIMETYPE_STR
from app.trip_package.schemas import (
    TripCollectionPackage,
    TripExpensePackage,
    TripItineraryPackage,
    TripPackageManifest,
    TripWalletPackage,
)

logger = logging.getLogger(__name__)


class TripPackageValidationError(Exception):
    """Raised when a .trip archive violates package integrity or structure."""

    pass


class TripUnpacker:
    """Safely inspects, validates, and unpacks a .trip archive file."""

    def __init__(self, package_path: str | Path) -> None:
        self.path = Path(package_path)
        if not self.path.exists():
            raise FileNotFoundError(f"Package not found: {self.path}")

    def inspect_manifest(self) -> TripPackageManifest:
        """Reads and validates paladio.json without extracting the whole archive."""
        with zipfile.ZipFile(self.path, "r") as zf:
            self._verify_mimetype(zf)
            if "paladio.json" not in zf.namelist():
                raise TripPackageValidationError(
                    "Missing required paladio.json manifest in package root."
                )

            manifest_bytes = zf.read("paladio.json")
            try:
                manifest_data = json.loads(manifest_bytes.decode("utf-8"))
                return TripPackageManifest.model_validate(manifest_data)
            except Exception as e:
                raise TripPackageValidationError(
                    f"Invalid paladio.json manifest: {e}"
                ) from e

    def verify_integrity(self) -> tuple[bool, list[str]]:
        """Verifies that all files recorded in the manifest match their SHA-256 digests."""
        manifest = self.inspect_manifest()
        mismatches: list[str] = []

        with zipfile.ZipFile(self.path, "r") as zf:
            namelist = set(zf.namelist())
            for filename, item in manifest.file_manifest.items():
                if filename not in namelist:
                    mismatches.append(f"Missing file in archive: {filename}")
                    continue
                content = zf.read(filename)
                computed_sha = hashlib.sha256(content).hexdigest()
                if computed_sha != item.sha256:
                    mismatches.append(
                        f"Checksum mismatch for {filename}: expected {item.sha256}, got {computed_sha}"
                    )

        return len(mismatches) == 0, mismatches

    def unpack(self, extract_to_dir: str | Path | None = None) -> dict[str, Any]:
        """Validates, parses domain JSONs, and safely extracts attachments if target dir provided."""
        is_valid, mismatches = self.verify_integrity()
        if not is_valid:
            raise TripPackageValidationError(
                f"Package integrity failure: {'; '.join(mismatches)}"
            )

        manifest = self.inspect_manifest()

        with zipfile.ZipFile(self.path, "r") as zf:
            # Read core domain sub-files
            itinerary_data = json.loads(zf.read("itinerary.json").decode("utf-8"))
            wallet_data = json.loads(zf.read("wallet.json").decode("utf-8"))
            expenses_data = json.loads(zf.read("expenses.json").decode("utf-8"))
            collections_data = json.loads(zf.read("collections.json").decode("utf-8"))

            # Validate against schemas
            TripItineraryPackage.model_validate(itinerary_data)
            TripWalletPackage.model_validate(wallet_data)
            TripExpensePackage.model_validate(expenses_data)
            TripCollectionPackage.model_validate(collections_data)

            extracted_files: list[Path] = []
            if extract_to_dir is not None:
                dest = Path(extract_to_dir).resolve()
                dest.mkdir(parents=True, exist_ok=True)

                for member in zf.infolist():
                    # Zip-slip prevention: Ensure target path is within extraction directory
                    target_path = (dest / member.filename).resolve()
                    if not str(target_path).startswith(str(dest)):
                        raise TripPackageValidationError(
                            f"Path traversal detected in archive member: {member.filename}"
                        )

                    if member.is_dir():
                        target_path.mkdir(parents=True, exist_ok=True)
                    else:
                        target_path.parent.mkdir(parents=True, exist_ok=True)
                        with zf.open(member) as source, open(
                            target_path, "wb"
                        ) as target:
                            target.write(source.read())
                        extracted_files.append(target_path)

            return {
                "manifest": manifest,
                "itinerary": itinerary_data,
                "wallet": wallet_data,
                "expenses": expenses_data,
                "collections": collections_data,
                "extracted_files": extracted_files,
            }

    @staticmethod
    def _verify_mimetype(zf: zipfile.ZipFile) -> None:
        names = zf.namelist()
        if not names or names[0] != "mimetype":
            raise TripPackageValidationError(
                "Invalid .trip archive: 'mimetype' must be the first entry in the archive."
            )
        info = zf.getinfo("mimetype")
        if info.compress_type != zipfile.ZIP_STORED:
            raise TripPackageValidationError(
                "Invalid .trip archive: 'mimetype' entry must be stored uncompressed (ZIP_STORED)."
            )
        content = zf.read("mimetype").decode("ascii").strip()
        if content != MIMETYPE_STR:
            raise TripPackageValidationError(
                f"Invalid .trip archive: Unexpected MIME type '{content}', expected '{MIMETYPE_STR}'."
            )
