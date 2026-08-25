import urllib.parse
from app.scraper.http_scrapers import VuelingScraper, EasyJetScraper, SkyscannerScraper
from app.scraper.duffel_scraper import DuffelScraper
from app.scraper.strategies.hotels import HotelScraperStrategy
from app.scraper.strategies.restaurants import RestaurantScraperStrategy
import logging

logger = logging.getLogger(__name__)

def parse_flight(f):
    if isinstance(f, dict) and "financials" not in f:
        if "price" not in f or "arrival_time" not in f or "departure_time" not in f: return None
        return {"price": float(f["price"]), "arrival_time": f["arrival_time"], "departure_time": f["departure_time"]}
    price = f.get("financials", {}).get("price") if isinstance(f, dict) else getattr(getattr(f, "financials", None), "price", None)
    arr = f.get("schedule", {}).get("arrival_utc") if isinstance(f, dict) else getattr(getattr(f, "schedule", None), "arrival_utc", None)
    dep = f.get("schedule", {}).get("departure_utc") if isinstance(f, dict) else getattr(getattr(f, "schedule", None), "departure_utc", None)
    if price is None or not arr or not dep: return None
    arr_str, dep_str = str(arr), str(dep)
    return {"price": float(price), "arrival_time": arr_str[11:16] if 'T' in arr_str or ' ' in arr_str else arr_str[:5], "departure_time": dep_str[11:16] if 'T' in dep_str or ' ' in dep_str else dep_str[:5]}

async def fetch_flight(org, dest, date_obj, test_data=None, fallback_key=None):
    if not org or org.lower() == "unknown": return None
    date_str = date_obj.strftime("%Y-%m-%d") if hasattr(date_obj, 'strftime') else str(date_obj)
    
    if test_data and fallback_key in test_data and test_data[fallback_key]:
        parsed = parse_flight(test_data[fallback_key][0])
        if parsed: return [parsed]
        
    try:
        res = await SkyscannerScraper().scrape_flights(org, dest, date_str)
        if res and parse_flight(res[0]): return [parse_flight(res[0])]
    except Exception as e: 
        logger.debug(f"SkyscannerScraper error: {e}")
    
    try:
        res = await VuelingScraper().scrape_flights(org, dest, date_str)
        if res and parse_flight(res[0]): return [parse_flight(res[0])]
    except Exception as e: 
        logger.debug(f"VuelingScraper error: {e}")
    
    try:
        res = await EasyJetScraper().scrape_flights(org, dest, date_str)
        if res and parse_flight(res[0]): return [parse_flight(res[0])]
    except Exception as e: 
        logger.debug(f"EasyJetScraper error: {e}")
    
    try:
        res = DuffelScraper().scrape_flights(org, dest, date_str)
        if res and parse_flight(res[0]): return [parse_flight(res[0])]
    except Exception as e: 
        logger.debug(f"DuffelScraper error: {e}")
    
    return None

async def fetch_hotels(city: str, test_data=None):
    if test_data and "hotels" in test_data:
        return test_data["hotels"][:2]
        
    hotels_data = []
    try:
        from app.scraper.amadeus_scraper import AmadeusScraper
        res = AmadeusScraper().scrape_hotels(city)
        if res: hotels_data.extend(res)
    except Exception as e: 
        logger.debug(f"AmadeusScraper error: {e}")
    
    if not hotels_data:
        try:
            hotel_url = f"https://www.booking.com/searchresults.html?ss={urllib.parse.quote(city)}"
            res = await HotelScraperStrategy().scrape(hotel_url)
            hotels_data = res.get("extracted_data", [])[:2]
        except Exception as e: 
            logger.debug(f"HotelScraperStrategy error: {e}")
        
    if not hotels_data:
        raise RuntimeError("All hotel scrapers failed.")
        
    return hotels_data

async def fetch_restaurants(city: str, test_data=None):
    if test_data and "restaurants" in test_data:
        return test_data["restaurants"][:15]
        
    try:
        yelp_url = f"https://www.yelp.com/search?find_loc={urllib.parse.quote(city)}"
        res = await RestaurantScraperStrategy().scrape(yelp_url)
        return res.get("extracted_data", [])[:15]
    except Exception as e:
        logger.debug(f"RestaurantScraperStrategy error: {e}")
        return []
