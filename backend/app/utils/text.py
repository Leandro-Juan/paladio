def is_poi_mandatory(poi_name: str, mandatory_names: list[str]) -> bool:
    """
    Checks if a POI name matches any of the mandatory names using basic stop-word filtering.
    """
    if not mandatory_names:
        return False
    poi_name_lower = poi_name.lower()
    for m_name in mandatory_names:
        m_lower = m_name.lower()
        if m_lower in poi_name_lower or poi_name_lower in m_lower:
            return True
        m_words = [
            w
            for w in m_lower.split()
            if len(w) > 3
            and w not in ("museum", "the", "del", "de", "la", "el", "of", "and")
        ]
        if m_words and any(w in poi_name_lower for w in m_words):
            return True
    return False
