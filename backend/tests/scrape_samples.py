import asyncio
import json
import os
from dotenv import load_dotenv, find_dotenv

# Find and load the root .env file automatically
load_dotenv(find_dotenv(usecwd=True))

from app.scraper.dynamic_scraper import scrape_dynamic

async def main():
    os.makedirs("tests/output", exist_ok=True)
    
    # 1. Hotels in Madrid (with dates to show prices)
    hotel_url = "https://www.booking.com/searchresults.html?ss=Madrid&checkin=2026-09-01&checkout=2026-09-05"
    print(f"Scraping Hotels: {hotel_url}")
    try:
        hotel_data = await scrape_dynamic(hotel_url)
        with open("tests/output/hotels_madrid.json", "w") as f:
            json.dump(hotel_data, f, indent=4)
        print("✅ Saved Hotels to tests/output/hotels_madrid.json")
    except Exception as e:
        print(f"❌ Failed to scrape hotels: {e}")

    # 2. Flights from Madrid to Oporto
    flight_url = "https://www.ryanair.com/gb/en/trip/flights/select?adults=1&teens=0&children=0&infants=0&dateOut=2026-09-01&dateIn=&isConnectedFlight=false&isReturn=false&discount=0&promoCode=&originIata=MAD&destinationIata=OPO&tpAdults=1&tpTeens=0&tpChildren=0&tpInfants=0&tpStartDate=2026-09-01&tpEndDate=&tpDiscount=0&tpPromoCode=&tpOriginIata=MAD&tpDestinationIata=OPO"
    print(f"\nScraping Flights: {flight_url}")
    try:
        flight_data = await scrape_dynamic(flight_url)
        with open("tests/output/flights_mad_opo.json", "w", encoding="utf-8") as f:
            json.dump(flight_data, f, indent=4, ensure_ascii=False)
        print("✅ Saved Flights to tests/output/flights_mad_opo.json")
    except Exception as e:
        print(f"❌ Failed to scrape flights: {e}")

    # 3. Restaurants in Madrid via Tripadvisor
    ta_url = "https://www.tripadvisor.com/FindRestaurants?geo=187514&offset=0&broadened=false"
    print(f"\nScraping Restaurants (Tripadvisor): {ta_url}")
    try:
        ta_data = await scrape_dynamic(ta_url)
        with open("tests/output/restaurants_madrid_ta.json", "w", encoding="utf-8") as f:
            json.dump(ta_data, f, indent=4, ensure_ascii=False)
        print("✅ Saved Tripadvisor to tests/output/restaurants_madrid_ta.json")
    except Exception as e:
        print(f"❌ Failed to scrape tripadvisor: {e}")
        if hasattr(e, 'raw_html') and e.raw_html:
            with open("tests/output/ta_raw.html", "w", encoding="utf-8") as f:
                f.write(e.raw_html)
            print("Saved TA raw HTML")

    # 4. Restaurants in Madrid via Yelp
    yelp_url = "https://www.yelp.com/search?find_desc=Restaurants&find_loc=Madrid%2C+Spain"
    print(f"\nScraping Restaurants (Yelp): {yelp_url}")
    try:
        yelp_data = await scrape_dynamic(yelp_url)
        with open("tests/output/restaurants_madrid_yelp.json", "w", encoding="utf-8") as f:
            json.dump(yelp_data, f, indent=4, ensure_ascii=False)
        print("✅ Saved Yelp to tests/output/restaurants_madrid_yelp.json")
    except Exception as e:
        print(f"❌ Failed to scrape yelp: {e}")
        if hasattr(e, 'raw_html') and e.raw_html:
            with open("tests/output/yelp_raw.html", "w", encoding="utf-8") as f:
                f.write(e.raw_html)
            print("Saved Yelp raw HTML")

if __name__ == "__main__":
    asyncio.run(main())
