import asyncio
import sys
import os

# Ensure backend directory is in path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.services.poi_service import get_attractions_for_city
import logging

logging.basicConfig(level=logging.INFO)

async def main():
    # This should trigger a cache miss (blocks and fetches)
    pois = await get_attractions_for_city("Porto")
    print(f"Returned {len(pois)} POIs for Porto.")

if __name__ == "__main__":
    asyncio.run(main())
