import os
from pathlib import Path


def resolve_project_root() -> Path:
    """Resolve repository root (local) or app root (/app in Docker)."""
    curr = Path(__file__).resolve().parent
    for _ in range(5):
        if (curr / "docker-compose.yml").exists() or (
            curr / ".github" / "release-please-manifest.json"
        ).exists():
            return curr
        curr = curr.parent
    return Path(__file__).resolve().parents[2]


def resolve_runtime_data_dir() -> Path:
    """Resolve runtime data dir: PALADIO_DATA_DIR, .local/data, or /app/data."""
    custom = os.getenv("PALADIO_DATA_DIR")
    if custom:
        return Path(custom).resolve()
    root = resolve_project_root()
    if (root / "docker-compose.yml").exists():
        return (root / ".local" / "data").resolve()
    return (root / "data").resolve()
