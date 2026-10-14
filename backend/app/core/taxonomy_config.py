"""Controlled taxonomy vocabulary for POI facets, themes, vibes, audience, and schedules.

Enforces strict controlled vocabularies across Paladio hydration, retrieval, and UI filtering.
"""

from enum import Enum
from typing import Literal


class Theme(str, Enum):
    ART_PAINTING = "art_painting"
    SCULPTURE = "sculpture"
    ARCHAEOLOGY_ANTIQUITIES = "archaeology_antiquities"
    ROYAL_PALACE = "royal_palace"
    SACRED_RELIGIOUS = "sacred_religious"
    GOTHIC_ARCHITECTURE = "gothic_architecture"
    BAROQUE_ARCHITECTURE = "baroque_architecture"
    MODERNISM_CONTEMPORARY = "modernism_contemporary"
    MILITARY_FORTRESS = "military_fortress"
    SCIENCE_TECH = "science_tech"
    LITERARY_HISTORY = "literary_history"
    LOCAL_MARKET = "local_market"
    STREET_ART = "street_art"
    PANORAMIC_VIEWPOINT = "panoramic_viewpoint"
    BOTANICAL_GARDENS = "botanical_gardens"
    URBAN_PLAZA = "urban_plaza"
    FINE_DINING = "fine_dining"
    TRADITIONAL_TAVERN = "traditional_tavern"
    TAPAS_PINTXOS = "tapas_pintxos"
    SPECIALTY_COFFEE = "specialty_coffee"
    CRAFT_BEER_WINE = "craft_beer_wine"
    COCKTAIL_ROOFTOP = "cocktail_rooftop"
    LIVE_MUSIC_JAZZ = "live_music_jazz"
    FLAMENCO_FOLKLORE = "flamenco_folklore"


class Vibe(str, Enum):
    ICONIC_MUST_SEE = "iconic_must_see"
    HIDDEN_GEM = "hidden_gem"
    QUIET_CONTEMPLATIVE = "quiet_contemplative"
    ROMANTIC_SUNSET = "romantic_sunset"
    LIVELY_BUSTLING = "lively_bustling"
    BOHEMIAN_ARTSY = "bohemian_artsy"
    LUXURY_UPSCALE = "luxury_upscale"
    CASUAL_AUTHENTIC = "casual_authentic"
    LATE_NIGHT = "late_night"


class Audience(str, Enum):
    SOLO_FRIENDLY = "solo_friendly"
    COUPLES = "couples"
    FAMILIES_KIDS = "families_kids"
    SENIORS_ACCESSIBLE = "seniors_accessible"
    RAINY_DAY_SHELTER = "rainy_day_shelter"
    BUDGET_FREE = "budget_free"


class TimeOfDay(str, Enum):
    MORNING = "morning"
    AFTERNOON = "afternoon"
    SUNSET_GOLDEN_HOUR = "sunset_golden_hour"
    EVENING_NIGHT = "evening_night"


IndoorOutdoor = Literal["indoor", "outdoor", "mixed"]
PriceLevel = Literal["free", "budget", "mid", "fine_dining", "luxury"]

VALID_THEMES: set[str] = {t.value for t in Theme}
VALID_VIBES: set[str] = {v.value for v in Vibe}
VALID_AUDIENCE: set[str] = {a.value for a in Audience}
VALID_TIME_OF_DAY: set[str] = {tod.value for tod in TimeOfDay}
VALID_INDOOR_OUTDOOR: set[str] = {"indoor", "outdoor", "mixed"}
VALID_PRICE_LEVELS: set[str] = {"free", "budget", "mid", "fine_dining", "luxury"}
