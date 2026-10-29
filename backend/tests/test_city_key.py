import os
import random
import re
import subprocess
import sys

from app.domain.city_key import (
    generate_city_key,
    normalize_to_canonical_city_key,
    LEGACY_ALIASES,
)


COHORT_CITIES = [
    # Rich GTFS, large
    ("Tokyo", "JP"),
    ("Paris", "FR"),
    ("London", "GB"),
    ("New York", "US"),
    ("Seoul", "KR"),
    ("Madrid", "ES"),
    ("Barcelona", "ES"),
    ("Berlin", "DE"),
    ("Sydney", "AU"),
    ("Toronto", "CA"),
    # Multi-operator
    ("Chicago", "US"),
    ("Zurich", "CH"),
    ("Amsterdam", "NL"),
    ("Hong Kong", "HK"),
    # Non-Latin names
    ("東京", "JP"),
    ("Москва", "RU"),
    ("서울", "KR"),
    ("القاهرة", "EG"),
    ("กรุงเทพมหานคร", "TH"),
    ("Αθήνα", "GR"),
    ("თბილისი", "GE"),
    ("תל אביב", "IL"),
    ("मुंबई", "IN"),
    # Diacritics & Collisions
    ("São Paulo", "BR"),
    ("Zürich", "CH"),
    ("Córdoba", "AR"),
    ("Córdoba", "ES"),
    ("Birmingham", "GB"),
    ("Birmingham", "US"),
    ("Valencia", "ES"),
    ("Valencia", "VE"),
    ("Santiago", "CL"),
    ("Santiago", "ES"),
    # Edge geography
    ("Suva", "FJ"),
    ("Anadyr", "RU"),
    ("Reykjavik", "IS"),
    ("Longyearbyen", "SJ"),
    ("Honolulu", "US"),
    ("Singapore", "SG"),
    ("Monaco", "MC"),
    ("Istanbul", "TR"),
]


def test_city_key_cohort_properties():
    keys = set()
    for name, country in COHORT_CITIES:
        key = generate_city_key(name, country)
        # 1. Non-empty
        assert key, f"Empty key for {name}, {country}"
        # 2. Path-safe (strictly [a-z0-9_-], no slashes, no ..)
        assert re.match(r"^[a-z0-9_-]+$", key), f"Unsafe path characters in {key}"
        assert ".." not in key
        assert "/" not in key
        assert "\\" not in key
        # 3. Ends with country and/or id part
        assert country.lower() in key or "xx" in key
        keys.add((name, country, key))


def test_city_key_collision_avoidance():
    # Cordoba AR vs ES must have distinct keys
    cordoba_ar = generate_city_key("Córdoba", "AR")
    cordoba_es = generate_city_key("Córdoba", "ES")
    assert cordoba_ar != cordoba_es
    assert "-ar-" in cordoba_ar
    assert "-es-" in cordoba_es

    # Birmingham UK vs US
    birm_uk = generate_city_key("Birmingham", "GB")
    birm_us = generate_city_key("Birmingham", "US")
    assert birm_uk != birm_us
    assert "-gb-" in birm_uk
    assert "-us-" in birm_us

    # Valencia ES vs VE
    val_es = generate_city_key("Valencia", "ES")
    val_ve = generate_city_key("Valencia", "VE")
    assert val_es != val_ve


def test_city_key_legacy_aliases():
    for old_slug, canonical in LEGACY_ALIASES.items():
        assert normalize_to_canonical_city_key(old_slug) == canonical


def test_city_key_fuzz_5000_unicode_names():
    # Deterministic seed for reproducible fuzz testing
    rng = random.Random(42)
    # Generate 5,000 diverse Unicode strings with various scripts, emojis, and symbols
    unicode_ranges = [
        (0x0020, 0x007E),  # Basic Latin
        (0x00A0, 0x00FF),  # Latin-1 Supplement
        (0x0100, 0x017F),  # Latin Extended-A
        (0x0370, 0x03FF),  # Greek and Coptic
        (0x0400, 0x04FF),  # Cyrillic
        (0x0590, 0x05FF),  # Hebrew
        (0x0600, 0x06FF),  # Arabic
        (0x0900, 0x097F),  # Devanagari
        (0x4E00, 0x4FFF),  # CJK Unified Ideographs
        (0x3040, 0x309F),  # Hiragana
        (0xAC00, 0xAD00),  # Hangul Syllables
    ]

    for _ in range(5000):
        length = rng.randint(1, 20)
        chars = []
        for _ in range(length):
            start, end = rng.choice(unicode_ranges)
            chars.append(chr(rng.randint(start, end)))
        name = "".join(chars)
        cc = rng.choice(["US", "JP", "FR", "DE", "ES", "BR", "RU", "EG", "CN", None])

        key = generate_city_key(name, cc)
        # Must always be non-empty
        assert len(key) > 0
        # Strictly path-safe
        assert re.match(r"^[a-z0-9_-]+$", key)
        assert "/" not in key
        assert "\\" not in key
        assert ".." not in key


def test_city_key_salt_independence():
    """Verify that city_key generation produces identical outputs under different PYTHONHASHSEED values."""
    test_script = (
        "from app.domain.city_key import generate_city_key;"
        "print(generate_city_key('Córdoba', 'AR'),"
        "generate_city_key('東京', 'JP'),"
        "generate_city_key('São Paulo', 'BR'),"
        "generate_city_key('RandomUnicode_123', 'XX'))"
    )

    outputs = []
    for seed in ["0", "42", "12345", "random"]:
        env = os.environ.copy()
        env["PYTHONHASHSEED"] = seed
        res = subprocess.run(
            [sys.executable, "-c", test_script],
            env=env,
            capture_output=True,
            text=True,
            check=True,
            cwd=os.path.join(os.path.dirname(__file__), ".."),
        )
        outputs.append(res.stdout.strip())

    assert (
        len(set(outputs)) == 1
    ), f"city_key was not deterministic across hash seeds: {outputs}"
