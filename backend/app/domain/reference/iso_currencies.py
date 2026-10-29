"""Standard ISO Reference Datasets: Country Code (ISO 3166-1 alpha-2) to Currency (ISO 4217).

Official international standard reference table. Zero city-specific hardcoded data.
"""

from __future__ import annotations

# Standard ISO-3166-1 alpha-2 to ISO-4217 mapping
COUNTRY_TO_CURRENCY: dict[str, str] = {
    # Eurozone members
    "AD": "EUR",
    "AT": "EUR",
    "BE": "EUR",
    "CY": "EUR",
    "EE": "EUR",
    "ES": "EUR",
    "FI": "EUR",
    "FR": "EUR",
    "DE": "EUR",
    "GR": "EUR",
    "IE": "EUR",
    "IT": "EUR",
    "LV": "EUR",
    "LT": "EUR",
    "LU": "EUR",
    "MT": "EUR",
    "MC": "EUR",
    "ME": "EUR",
    "NL": "EUR",
    "PT": "EUR",
    "SM": "EUR",
    "SK": "EUR",
    "SI": "EUR",
    "VA": "EUR",
    "XK": "EUR",
    "HR": "EUR",
    # Other European countries
    "AL": "ALL",
    "BA": "BAM",
    "BG": "BGN",
    "BY": "BYN",
    "CH": "CHF",
    "CZ": "CZK",
    "DK": "DKK",
    "GB": "GBP",
    "GE": "GEL",
    "HU": "HUF",
    "IS": "ISK",
    "MD": "MDL",
    "MK": "MKD",
    "NO": "NOK",
    "PL": "PLN",
    "RO": "RON",
    "RS": "RSD",
    "SE": "SEK",
    "UA": "UAH",
    # Americas
    "AR": "ARS",
    "BO": "BOB",
    "BR": "BRL",
    "CA": "CAD",
    "CL": "CLP",
    "CO": "COP",
    "CR": "CRC",
    "CU": "CUP",
    "DO": "DOP",
    "EC": "USD",
    "GT": "GTQ",
    "HN": "HNL",
    "JM": "JMD",
    "MX": "MXN",
    "NI": "NIO",
    "PA": "PAB",
    "PE": "PEN",
    "PY": "PYG",
    "SV": "USD",
    "US": "USD",
    "UY": "UYU",
    "VE": "VES",
    # Asia & Pacific
    "AE": "AED",
    "AM": "AMD",
    "AU": "AUD",
    "AZ": "AZN",
    "BD": "BDT",
    "BH": "BHD",
    "BN": "BND",
    "CN": "CNY",
    "HK": "HKD",
    "ID": "IDR",
    "IL": "ILS",
    "IN": "INR",
    "IQ": "IQD",
    "IR": "IRR",
    "JO": "JOD",
    "JP": "JPY",
    "KG": "KGS",
    "KH": "KHR",
    "KR": "KRW",
    "KW": "KWD",
    "KZ": "KZT",
    "LA": "LAK",
    "LB": "LBP",
    "LK": "LKR",
    "MM": "MMK",
    "MN": "MNT",
    "MO": "MOP",
    "MY": "MYR",
    "NP": "NPR",
    "NZ": "NZD",
    "OM": "OMR",
    "PH": "PHP",
    "PK": "PKR",
    "QA": "QAR",
    "SA": "SAR",
    "SG": "SGD",
    "TH": "THB",
    "TJ": "TJS",
    "TM": "TMT",
    "TR": "TRY",
    "TW": "TWD",
    "UZ": "UZS",
    "VN": "VND",
    "YE": "YER",
    # Africa
    "DZ": "DZD",
    "EG": "EGP",
    "ET": "ETB",
    "GH": "GHS",
    "KE": "KES",
    "MA": "MAD",
    "MU": "MUR",
    "NG": "NGN",
    "RW": "RWF",
    "SC": "SCR",
    "TN": "TND",
    "TZ": "TZS",
    "UG": "UGX",
    "ZA": "ZAR",
}


def get_country_currency(country_code: str | None) -> str:
    """Returns the ISO 4217 currency code for a given ISO 3166-1 alpha-2 country code."""
    if not country_code:
        return "EUR"
    code = country_code.upper().strip()
    return COUNTRY_TO_CURRENCY.get(code, "EUR")


# ISO 4217 minor unit exponent mapping (default is 2)
CURRENCY_EXPONENTS: dict[str, int] = {
    # 0 decimals (no minor units)
    "JPY": 0,
    "KRW": 0,
    "VND": 0,
    "CLP": 0,
    "ISK": 0,
    "PYG": 0,
    "UGX": 0,
    "RWF": 0,
    "BIF": 0,
    "DJF": 0,
    "GNF": 0,
    "KMF": 0,
    "XAF": 0,
    "XOF": 0,
    "XPF": 0,
    # 3 decimals
    "BHD": 3,
    "IQD": 3,
    "JOD": 3,
    "KWD": 3,
    "LYD": 3,
    "OMR": 3,
    "TND": 3,
}


def get_currency_exponent(currency: str) -> int:
    """Returns the ISO 4217 minor unit exponent (default is 2)."""
    return CURRENCY_EXPONENTS.get(currency.upper().strip(), 2)


def to_minor_units(amount: float, currency: str) -> int:
    """Converts a major currency float to integer minor units."""
    exp = get_currency_exponent(currency)
    return int(round(amount * (10**exp)))


def from_minor_units(amount_minor: int, currency: str) -> float:
    """Converts integer minor units back to standard float amount."""
    exp = get_currency_exponent(currency)
    return round(float(amount_minor) / (10**exp), exp)
