# Scraper JSON Data Formats

This document outlines the structured JSON formats required for all travel data items in Paladio. These structures are defined by the Pydantic models in `backend/app/schemas/scraper.py` and are used universally across the scrapers, test datasets (`test_data.json`), and the C++ routing engine.

---

## 1. Flight (`type: "flight"`)

Represents a single flight leg (outbound or return).

```json
{
  "id": "FLIGHT-123",
  "type": "flight",
  "airline": "Ryanair",
  "flight_number": "FR1234",
  "route": {
    "origin_iata": "LON",
    "destination_iata": "BCN"
  },
  "schedule": {
    "departure_utc": "2026-08-22T10:00:00Z",
    "arrival_utc": "2026-08-22T12:00:00Z",
    "duration_minutes": 120
  },
  "financials": {
    "price": 150.00,
    "currency": "EUR"
  },
  "booking": {
    "provider_url": "https://www.ryanair.com/..."
  },
  "metadata": {
    "scraped_at": "2026-08-22T12:00:00Z",
    "source": "Ryanair Scraper"
  }
}
```

---

## 2. Hotel (`type: "hotel"`)

Represents a lodging option. These serve as the "Base Nodes" where days in the itinerary begin and end.

```json
{
  "id": "HOTEL-456",
  "type": "hotel",
  "name": "Hilton Barcelona",
  "location": {
    "latitude": 41.38879,
    "longitude": 2.15899
  },
  "stay": {
    "check_in_date": "2026-08-23",
    "check_out_date": "2026-08-28",
    "nights": 5,
    "capacity": 2
  },
  "financials": {
    "total_price": 750.00,
    "price_per_night": 150.00,
    "currency": "EUR"
  },
  "scoring": {
    "rating": 4.5,
    "reviews": 1200
  },
  "amenities": [
    "Wifi",
    "Pool",
    "Breakfast"
  ],
  "booking": {
    "provider_url": "https://www.booking.com/..."
  },
  "metadata": {
    "scraped_at": "2026-08-22T12:00:00Z",
    "source": "Booking.com"
  }
}
```

---

## 3. Food and Drink (`type: "food_and_drink"`)

Represents restaurants, cafes, and bars to be slotted into the itinerary during meal windows.

```json
{
  "id": "REST-789",
  "type": "food_and_drink",
  "category": "restaurant",
  "name": "The Golden Spoon",
  "location": {
    "latitude": 41.3912,
    "longitude": 2.1645
  },
  "schedule": {
    "opening_time_local": "12:00",
    "closing_time_local": "23:00",
    "recommended_duration_minutes": 90
  },
  "meal_suitability": {
    "is_breakfast": false,
    "is_lunch": true,
    "is_dinner": true,
    "is_snack": false
  },
  "financials": {
    "price_tier": "$$",
    "currency": "EUR"
  },
  "scoring": {
    "rating": 4.8,
    "reviews": 350
  },
  "cuisine": [
    "Tapas",
    "Spanish"
  ],
  "dietary_options": [
    "Vegetarian friendly"
  ],
  "metadata": {
    "scraped_at": "2026-08-22T12:00:00Z",
    "source": "Yelp"
  }
}
```

---

## 4. Attraction / POI (`type: "attraction"`)

Represents Points of Interest (POIs) such as museums, landmarks, and historic sites.

```json
{
  "id": "POI-101",
  "type": "attraction",
  "category": "museum",
  "name": "National Art Gallery",
  "location": {
    "latitude": 41.3851,
    "longitude": 2.1734
  },
  "schedule": {
    "osm_opening_hours": "Mo-Su 09:00-18:00",
    "recommended_duration_minutes": 120
  },
  "financials": {
    "is_free": false,
    "estimated_cost": 15.50,
    "currency": "EUR"
  },
  "scoring": {
    "rating": 4.7,
    "reviews": 5000
  },
  "metadata": {
    "scraped_at": "2026-08-22T12:00:00Z",
    "source": "PostGIS DB"
  }
}
```
