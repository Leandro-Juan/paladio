def is_poi_mandatory(poi_name: str, mandatory_names: list[str]) -> bool:
    """
    Checks if a POI name matches any of the mandatory names using basic stop-word filtering.
    """
    if not mandatory_names:
        return False
    poi_name_lower = poi_name.lower()
    for m_name in mandatory_names:
        m_lower = m_name.lower()
        m_words = [
            w
            for w in m_lower.split()
            if len(w) > 3
            and w not in ("museum", "the", "del", "de", "la", "el", "of", "and")
        ]
        import re

        for m_word in m_words:
            # Stricter whole-word matching using word boundaries
            if re.search(rf"\b{re.escape(m_word)}\b", poi_name_lower):
                return True
    return False
