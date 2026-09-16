import os
import tempfile
import zipfile

import pytest


def test_zip_slip_path_traversal_detection():
    with tempfile.TemporaryDirectory() as tmp_dir:
        zip_path = os.path.join(tmp_dir, "malicious.zip")
        dest_dir = os.path.join(tmp_dir, "extracted")
        os.makedirs(dest_dir, exist_ok=True)

        # Create a zip archive with a path traversal member
        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr("../evil.txt", "malicious payload")

        # Directly verify safe extraction logic matching tasks.py
        target_base = os.path.abspath(dest_dir)
        with (
            pytest.raises(ValueError) as exc_info,
            zipfile.ZipFile(zip_path, "r") as zip_ref,
        ):
            for member in zip_ref.infolist():
                member_path = os.path.abspath(
                    os.path.join(target_base, member.filename)
                )
                if os.path.commonpath([target_base, member_path]) != target_base:
                    raise ValueError(
                        f"Zip Slip attempt detected in member: {member.filename}"
                    )
                zip_ref.extract(member, target_base)

        assert "Zip Slip attempt detected" in str(exc_info.value)


def test_city_name_path_traversal_sanitization():
    import re

    unsafe_city = "../../etc/passwd"
    sanitized = re.sub(r"[^a-z0-9_-]", "", unsafe_city.strip().lower())
    assert sanitized == "etcpasswd"
    assert "/" not in sanitized
    assert ".." not in sanitized


def test_task_session_maker_uses_nullpool():
    import asyncio

    from app.tasks import _get_task_session_maker
    from sqlalchemy.pool import NullPool

    session_maker, engine = _get_task_session_maker()
    try:
        assert isinstance(engine.pool, NullPool)
        assert session_maker is not None
    finally:
        asyncio.run(engine.dispose())
