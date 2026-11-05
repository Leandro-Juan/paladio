import subprocess
import sys
from pathlib import Path

from app.schemas.user import UserPreferences, normalize_user_preferences


def test_user_preferences_default_language():
    prefs = UserPreferences()
    assert prefs.preferred_language == "en"
    dumped = prefs.model_dump(mode="json")
    assert dumped["preferred_language"] == "en"


def test_user_preferences_custom_language():
    prefs = UserPreferences(preferred_language="ja")
    assert prefs.preferred_language == "ja"

    normalized = normalize_user_preferences({"preferred_language": "ar"})
    assert normalized.preferred_language == "ar"


def test_user_create_with_preferred_language():
    from app.schemas.user import UserCreate

    uc = UserCreate(
        username="frenchie", password="securepassword123", preferred_language="fr"
    )
    assert uc.preferred_language == "fr"


def test_locale_files_parity_and_integrity():
    repo_root = Path(__file__).resolve().parent.parent.parent
    script_path = repo_root / "scripts" / "i18n" / "validate_locales.py"
    assert script_path.exists(), "validate_locales.py not found"

    res = subprocess.run(
        [sys.executable, str(script_path)], capture_output=True, text=True
    )
    assert res.returncode == 0, f"Validator failed:\n{res.stdout}\n{res.stderr}"
    assert "All locale dictionaries passed validation with 100% parity!" in res.stdout
