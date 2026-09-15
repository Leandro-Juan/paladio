import asyncio
import logging
from datetime import datetime, timezone

from app.db.models import AttractionModel, CityTransitFareModel
from app.db.session import async_session
from app.services.transit_fare_service import VERIFIED_CITY_FARES
from sqlalchemy.dialects.postgresql import insert

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed_pricing")

# Top Real-World POIs coordinates & categories for the 5 cities
TOP_POIS_DATA = [
    # Madrid
    {
        "id": "OSM-node-madrid-prado",
        "name": "Museo del Prado",
        "city": "madrid",
        "category": "museum",
        "lat": 40.4138,
        "lon": -3.6922,
        "duration": 120,
    },
    {
        "id": "OSM-node-madrid-reina-sofia",
        "name": "Museo Reina Sofía",
        "city": "madrid",
        "category": "museum",
        "lat": 40.4080,
        "lon": -3.6946,
        "duration": 120,
    },
    {
        "id": "OSM-node-madrid-palacio-real",
        "name": "Palacio Real de Madrid",
        "city": "madrid",
        "category": "monument",
        "lat": 40.4180,
        "lon": -3.7143,
        "duration": 90,
    },
    {
        "id": "OSM-node-madrid-retiro",
        "name": "Parque del Retiro",
        "city": "madrid",
        "category": "park",
        "lat": 40.4153,
        "lon": -3.6845,
        "duration": 60,
    },
    {
        "id": "OSM-node-madrid-sol",
        "name": "Puerta del Sol",
        "city": "madrid",
        "category": "monument",
        "lat": 40.4168,
        "lon": -3.7038,
        "duration": 45,
    },
    {
        "id": "OSM-node-madrid-bernabeu",
        "name": "Estadio Santiago Bernabéu",
        "city": "madrid",
        "category": "monument",
        "lat": 40.4531,
        "lon": -3.6883,
        "duration": 90,
    },
    # Paris
    {
        "id": "OSM-node-paris-louvre",
        "name": "Musée du Louvre",
        "city": "paris",
        "category": "museum",
        "lat": 48.8606,
        "lon": 2.3376,
        "duration": 180,
    },
    {
        "id": "OSM-node-paris-eiffel",
        "name": "Tour Eiffel",
        "city": "paris",
        "category": "monument",
        "lat": 48.8584,
        "lon": 2.2945,
        "duration": 120,
    },
    {
        "id": "OSM-node-paris-orsay",
        "name": "Musée d'Orsay",
        "city": "paris",
        "category": "museum",
        "lat": 48.8599,
        "lon": 2.3266,
        "duration": 120,
    },
    {
        "id": "OSM-node-paris-notre-dame",
        "name": "Cathédrale Notre-Dame",
        "city": "paris",
        "category": "monument",
        "lat": 48.8530,
        "lon": 2.3499,
        "duration": 60,
    },
    {
        "id": "OSM-node-paris-sacre-coeur",
        "name": "Basilique du Sacré-Cœur",
        "city": "paris",
        "category": "monument",
        "lat": 48.8867,
        "lon": 2.3431,
        "duration": 60,
    },
    # Lisbon
    {
        "id": "OSM-node-lisbon-jeronimos",
        "name": "Mosteiro dos Jerónimos",
        "city": "lisbon",
        "category": "monument",
        "lat": 38.6979,
        "lon": -9.2067,
        "duration": 90,
    },
    {
        "id": "OSM-node-lisbon-belem",
        "name": "Torre de Belém",
        "city": "lisbon",
        "category": "monument",
        "lat": 38.6916,
        "lon": -9.2160,
        "duration": 60,
    },
    {
        "id": "OSM-node-lisbon-castelo",
        "name": "Castelo de São Jorge",
        "city": "lisbon",
        "category": "monument",
        "lat": 38.7139,
        "lon": -9.1335,
        "duration": 90,
    },
    {
        "id": "OSM-node-lisbon-comercio",
        "name": "Praça do Comércio",
        "city": "lisbon",
        "category": "monument",
        "lat": 38.7075,
        "lon": -9.1364,
        "duration": 45,
    },
    {
        "id": "OSM-node-lisbon-oceanario",
        "name": "Oceanário de Lisboa",
        "city": "lisbon",
        "category": "museum",
        "lat": 38.7635,
        "lon": -9.0937,
        "duration": 120,
    },
    # Barcelona
    {
        "id": "OSM-node-barcelona-sagrada-familia",
        "name": "Sagrada Família",
        "city": "barcelona",
        "category": "monument",
        "lat": 41.4036,
        "lon": 2.1744,
        "duration": 120,
    },
    {
        "id": "OSM-node-barcelona-park-guell",
        "name": "Park Güell",
        "city": "barcelona",
        "category": "park",
        "lat": 41.4145,
        "lon": 2.1527,
        "duration": 90,
    },
    {
        "id": "OSM-node-barcelona-casa-batllo",
        "name": "Casa Batlló",
        "city": "barcelona",
        "category": "monument",
        "lat": 41.3916,
        "lon": 2.1649,
        "duration": 75,
    },
    {
        "id": "OSM-node-barcelona-casa-mila",
        "name": "Casa Milà",
        "city": "barcelona",
        "category": "monument",
        "lat": 41.3953,
        "lon": 2.1619,
        "duration": 75,
    },
    {
        "id": "OSM-node-barcelona-gotic",
        "name": "Barri Gòtic",
        "city": "barcelona",
        "category": "monument",
        "lat": 41.3833,
        "lon": 2.1764,
        "duration": 60,
    },
    # Rome
    {
        "id": "OSM-node-rome-colosseo",
        "name": "Colosseo",
        "city": "rome",
        "category": "monument",
        "lat": 41.8902,
        "lon": 12.4922,
        "duration": 120,
    },
    {
        "id": "OSM-node-rome-pantheon",
        "name": "Pantheon",
        "city": "rome",
        "category": "monument",
        "lat": 41.8986,
        "lon": 12.4769,
        "duration": 60,
    },
    {
        "id": "OSM-node-rome-vatican",
        "name": "Musei Vaticani",
        "city": "rome",
        "category": "museum",
        "lat": 41.9067,
        "lon": 12.4536,
        "duration": 180,
    },
    {
        "id": "OSM-node-rome-trevi",
        "name": "Fontana di Trevi",
        "city": "rome",
        "category": "monument",
        "lat": 41.9009,
        "lon": 12.4833,
        "duration": 45,
    },
    {
        "id": "OSM-node-rome-san-pietro",
        "name": "Basilica di San Pietro",
        "city": "rome",
        "category": "monument",
        "lat": 41.9022,
        "lon": 12.4539,
        "duration": 90,
    },
]


async def seed_data():
    logger.info("Starting seed of real-world transit tariffs and POIs for 5 cities...")
    async with async_session() as session:
        # 1. Seed Transit Fares
        logger.info("Seeding verified city transit fares...")
        for fare in VERIFIED_CITY_FARES.values():
            stmt = insert(CityTransitFareModel).values(
                city=fare.city,
                country=fare.country,
                currency=fare.currency,
                single_fare=fare.single_fare,
                pass_24h_price=fare.pass_24h_price,
                pass_24h_name=fare.pass_24h_name,
                pass_24h_includes_airport=fare.pass_24h_includes_airport,
                airport_surcharge=fare.airport_surcharge,
                airport_station_keywords=fare.airport_station_keywords,
                is_estimated=fare.is_estimated,
                source=fare.source,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["city"],
                set_={
                    "country": fare.country,
                    "currency": fare.currency,
                    "single_fare": fare.single_fare,
                    "pass_24h_price": fare.pass_24h_price,
                    "pass_24h_name": fare.pass_24h_name,
                    "pass_24h_includes_airport": fare.pass_24h_includes_airport,
                    "airport_surcharge": fare.airport_surcharge,
                    "airport_station_keywords": fare.airport_station_keywords,
                    "is_estimated": fare.is_estimated,
                    "source": fare.source,
                },
            )
            await session.execute(stmt)

        # 2. Seed / Enrich POIs
        logger.info("Seeding verified real-world POIs for 5 cities...")
        from app.services.poi_pricing_service import PoiPricingService

        for poi in TOP_POIS_DATA:
            cost, is_est, source = PoiPricingService.resolve_poi_price(
                poi_name=poi["name"],
                city=poi["city"],
                category=poi["category"],
            )

            stmt = insert(AttractionModel).values(
                id=poi["id"],
                name=poi["name"],
                city=poi["city"],
                category=poi["category"],
                location={"latitude": poi["lat"], "longitude": poi["lon"]},
                schedule={"recommended_duration_minutes": poi["duration"]},
                financials={
                    "is_free": cost == 0.0,
                    "estimated_cost": cost,
                    "currency": "EUR",
                    "is_estimated": is_est,
                    "price_source": source,
                },
                scoring={"rating": 4.8, "reviews": 1000},
                metadata_field={
                    "source": "verified_catalog",
                    "scraped_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "name": poi["name"],
                    "city": poi["city"],
                    "category": poi["category"],
                    "location": {"latitude": poi["lat"], "longitude": poi["lon"]},
                    "schedule": {"recommended_duration_minutes": poi["duration"]},
                    "financials": {
                        "is_free": cost == 0.0,
                        "estimated_cost": cost,
                        "currency": "EUR",
                        "is_estimated": is_est,
                        "price_source": source,
                    },
                },
            )
            await session.execute(stmt)

        await session.commit()
        logger.info("Seeding completed successfully!")


if __name__ == "__main__":
    asyncio.run(seed_data())
