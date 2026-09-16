STOP_WORDS = {
    "museum",
    "museo",
    "monument",
    "monumento",
    "palace",
    "palacio",
    "park",
    "parque",
    "plaza",
    "square",
    "calle",
    "street",
    "avenida",
    "avenue",
    "jardin",
    "garden",
    "iglesia",
    "church",
    "catedral",
    "cathedral",
    "basilica",
    "teatro",
    "theatre",
    "theater",
    "the",
    "del",
    "de",
    "la",
    "el",
    "los",
    "las",
    "of",
    "and",
    "y",
    "en",
    "a",
}


def is_poi_mandatory(poi_name: str, mandatory_names: list[str]) -> bool:
    """
    Checks if a POI name matches any of the mandatory names using basic stop-word filtering.
    """
    if not mandatory_names:
        return False
    poi_name_lower = poi_name.lower()
    import re

    for m_name in mandatory_names:
        m_lower = m_name.lower().strip()
        if m_lower and m_lower == poi_name_lower:
            return True

        m_words = [
            w
            for w in re.findall(r"\b\w+\b", m_lower)
            if len(w) > 2 and w not in STOP_WORDS
        ]

        if not m_words:
            # Fallback to direct substring match if only generic/stop words provided
            if m_lower and (m_lower in poi_name_lower or poi_name_lower in m_lower):
                return True
            continue

        # Match if any distinctive keyword is found with word boundaries
        for m_word in m_words:
            if re.search(rf"\b{re.escape(m_word)}\b", poi_name_lower):
                return True
    return False
