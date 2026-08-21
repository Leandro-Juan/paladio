from typing import List

class AmenityFilter:
    """
    O(1) deterministic amenity filter that cleans a raw list of strings 
    using a comprehensive predefined static set of high-value keywords.
    """
    
    # We use a set for O(1) lookup. All keywords are lowercase for case-insensitive matching.
    HIGH_VALUE_AMENITIES = {
        # Internet
        "wifi", "free wifi", "internet", "high-speed internet", "wi-fi", "free wi-fi", 
        "conexión wifi gratis", "wifi gratis", "internet de alta velocidad",
        
        # Parking
        "parking", "free parking", "valet", "garage", "aparcamiento", "parking gratis",
        "private parking", "aparcamiento privado", "parking on site",
        
        # Pool
        "pool", "swimming pool", "indoor pool", "outdoor pool", "piscina", 
        "piscina al aire libre", "piscina cubierta", "rooftop pool",
        
        # Climate Control
        "air conditioning", "ac", "climate control", "aire acondicionado", "a/c",
        
        # Breakfast
        "breakfast", "free breakfast", "buffet breakfast", "desayuno", 
        "desayuno incluido", "breakfast included", "desayuno gratis",
        
        # Gym
        "gym", "fitness center", "workout room", "gimnasio", "fitness centre",
        
        # Reception
        "24-hour front desk", "24/7 reception", "recepción 24 horas", "24 hour front desk",
        
        # Pets
        "pets allowed", "pet friendly", "mascotas", "admite mascotas", "se admiten mascotas",
        
        # Spa & Wellness
        "spa", "sauna", "hot tub", "jacuzzi", "bañera de hidromasaje", "wellness center",
        
        # Kitchen
        "kitchen", "kitchenette", "cocina", "full kitchen", "zona de cocina",
        
        # Room Features
        "balcony", "terrace", "view", "terraza", "balcón", "city view", "sea view",
        "soundproof", "insonorización", "soundproofing", "habitaciones insonorizadas",
        
        # Transport
        "airport shuttle", "transfer", "traslado aeropuerto", "shuttle service", "airport drop-off",
        
        # Modern amenities
        "ev charging station", "carga vehículos eléctricos", "ev charging", "electric vehicle charging station"
    }

    @classmethod
    def clean_amenities(cls, raw_list: List[str]) -> List[str]:
        """
        Filters the raw list of amenities against the predefined high-value set.
        Time complexity: O(N) where N is the length of raw_list (O(1) lookup per item).
        Returns a sorted, unique list of matched high-value amenities.
        """
        cleaned = set()
        for raw_item in raw_list:
            if not raw_item:
                continue
            
            normalized = raw_item.strip().lower()
            
            # Direct match
            if normalized in cls.HIGH_VALUE_AMENITIES:
                cleaned.add(normalized.title()) # Store as Title Case for structured data
                continue
            
            # Partial match for compound strings often returned by scrapers (e.g., "Free WiFi in all rooms")
            # This makes it slightly more robust while remaining very fast.
            # We iterate over the static set to see if any high-value keyword is in the normalized string.
            for keyword in cls.HIGH_VALUE_AMENITIES:
                if keyword in normalized:
                    cleaned.add(keyword.title())
                    
        return sorted(list(cleaned))
