"""
Normalization utilities for hotel market data.
Provides locale-resilient price parsing, dynamic currency conversion,
and property name canonicalization without hardcoded assumptions.
"""

import re
import unicodedata
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import FXRateModel


from app.domain.reference.iso_currencies import COUNTRY_TO_CURRENCY

# Build set of all unique standard ISO 4217 currency codes
ALL_ISO_CURRENCIES: set[str] = set(COUNTRY_TO_CURRENCY.values())

# Common international currency symbols and unit representations mapped to ISO 4217
STANDARD_SYMBOL_MAP: dict[str, str] = {
    "€": "EUR",
    "$": "USD",
    "US$": "USD",
    "A$": "AUD",
    "CA$": "CAD",
    "NZ$": "NZD",
    "Mex$": "MXN",
    "S$": "SGD",
    "HK$": "HKD",
    "£": "GBP",
    "¥": "JPY",
    "₹": "INR",
    "₩": "KRW",
    "₽": "RUB",
    "₺": "TRY",
    "฿": "THB",
    "₫": "VND",
    "₱": "PHP",
    "₴": "UAH",
    "₪": "ILS",
    "zł": "PLN",
    "Kč": "CZK",
    "Ft": "HUF",
    "lei": "RON",
    "лв": "BGN",
    "kr": "SEK",
    "R$": "BRL",
}

# Dynamically populate CURRENCY_SYMBOLS with all ISO currencies and standard symbols,
# sorted by length descending so longer composite symbols (e.g. R$, US$, CA$) match first.
_ALL_SYMBOLS: dict[str, str] = {code: code for code in ALL_ISO_CURRENCIES}
_ALL_SYMBOLS.update(STANDARD_SYMBOL_MAP)
CURRENCY_SYMBOLS: dict[str, str] = dict(
    sorted(_ALL_SYMBOLS.items(), key=lambda item: len(item[0]), reverse=True)
)


def parse_money(
    raw_text: str | None, default_currency: str = "EUR"
) -> tuple[float | None, str]:
    """
    Parses a monetary string across European and Anglo-American formats.
    Correctly differentiates:
      - '€1.234,50' -> (1234.50, 'EUR')
      - '€1,234.50' -> (1234.50, 'EUR')
      - '120 €' -> (120.0, 'EUR')
      - '£ 85' -> (85.0, 'GBP')
      - '$1,299' -> (1299.0, 'USD')
    """
    if not raw_text:
        return None, default_currency

    text = raw_text.strip().replace("\xa0", " ")

    detected_currency = default_currency
    iso_match = re.search(r"\b([A-Za-z]{3})\b", text)
    if iso_match and iso_match.group(1).upper() in ALL_ISO_CURRENCIES:
        detected_currency = iso_match.group(1).upper()
    else:
        for symbol, code in CURRENCY_SYMBOLS.items():
            if symbol in text:
                detected_currency = code
                break

    # Strip currency symbols and letters, keeping digits, commas, dots, and minus
    cleaned = re.sub(r"[^\d,\.\-]", "", text)
    if not cleaned:
        return None, detected_currency

    # Handle negative sign if present
    negative = cleaned.startswith("-")
    if negative:
        cleaned = cleaned[1:]

    # Resolve decimal vs thousands separator
    has_comma = "," in cleaned
    has_dot = "." in cleaned

    if has_comma and has_dot:
        first_comma = cleaned.find(",")
        first_dot = cleaned.find(".")
        if first_dot < first_comma:
            # European format: 1.234,56
            num_str = cleaned.replace(".", "").replace(",", ".")
        else:
            # Anglo format: 1,234.56
            num_str = cleaned.replace(",", "")
    elif has_comma:
        # Check if comma represents decimal or thousands
        parts = cleaned.split(",")
        if len(parts) == 2 and len(parts[1]) in (1, 2):
            # Decimal separator: 123,45 or 123,5
            num_str = cleaned.replace(",", ".")
        elif len(parts) == 2 and len(parts[1]) == 3 and len(parts[0]) <= 3:
            # Ambiguous: e.g. 1,234. Treat as thousands
            num_str = cleaned.replace(",", "")
        else:
            num_str = cleaned.replace(",", "")
    elif has_dot:
        parts = cleaned.split(".")
        if len(parts) == 2 and len(parts[1]) in (1, 2):
            num_str = cleaned
        elif len(parts) == 2 and len(parts[1]) == 3 and len(parts[0]) <= 3:
            # e.g. 1.234 in Germany/Spain is thousands separator
            num_str = cleaned.replace(".", "")
        else:
            num_str = cleaned
    else:
        num_str = cleaned

    try:
        val = float(num_str)
        if negative:
            val = -val
        return val, detected_currency
    except (ValueError, TypeError):
        return None, detected_currency


def normalize_property_name(name: str | None) -> str:
    """
    Produces a normalized lower-case search token for cross-provider entity resolution.
    Removes accents, common lodging business stop words, and punctuation.
    """
    if not name:
        return ""

    # Normalize unicode (decompose accents)
    nfkd = unicodedata.normalize("NFKD", name)
    stripped = "".join(c for c in nfkd if not unicodedata.combining(c))

    lower = stripped.lower().strip()

    # Lodging category suffixes/prefixes that vary between platforms
    lodging_noise = [
        r"\bhotel\b",
        r"\bhostel\b",
        r"\bguesthouse\b",
        r"\bguest house\b",
        r"\bresort\b",
        r"\bapartments?\b",
        r"\balbergo\b",
        r"\bpensione\b",
        r"\binn\b",
        r"\bmotel\b",
        r"\bb&b\b",
        r"\bbed & breakfast\b",
        r"\bbed and breakfast\b",
        r"\bsuites?\b",
        r"\bvillas?\b",
        r"\bluxury\b",
        r"\bthe\b",
        r"\bde\b",
        r"\bdel\b",
        r"\bdi\b",
        r"\bdu\b",
        r"\bla\b",
        r"\ble\b",
    ]
    for pattern in lodging_noise:
        lower = re.sub(pattern, " ", lower, flags=re.IGNORECASE)

    # Remove non-alphanumeric characters
    cleaned = re.sub(r"[^a-z0-9\s]", " ", lower)
    # Collapse whitespace
    return " ".join(cleaned.split())


async def convert_to_eur(
    amount: float,
    currency: str,
    session: AsyncSession | None = None,
) -> float:
    """
    Converts amount in target currency to EUR using live FX rates from PostgreSQL.
    Zero hardcoded conversion constants.
    """
    curr = currency.upper().strip()
    if curr in ("EUR", ""):
        return amount

    if session is not None:
        try:
            stmt = (
                select(FXRateModel.rate)
                .where(
                    FXRateModel.base_currency == "EUR",
                    FXRateModel.quote_currency == curr,
                )
                .order_by(FXRateModel.as_of.desc())
                .limit(1)
            )
            res = await session.execute(stmt)
            rate_val = res.scalar_one_or_none()
            if rate_val and float(rate_val) > 0:
                # rate is 1 EUR = rate_val Units of quote_currency
                # so amount / rate_val gives EUR
                return round(amount / float(rate_val), 2)
        except Exception:
            pass

    # If not in DB or session is None, dynamically query live rates
    try:
        from app.engine.currency import fetch_live_rates

        rates = await fetch_live_rates("EUR")
        if curr in rates and float(rates[curr]) > 0:
            return round(amount / float(rates[curr]), 2)
    except Exception:
        pass

    return amount
