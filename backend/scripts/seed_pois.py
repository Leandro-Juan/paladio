import os

from langchain_core.documents import Document
from langchain_ollama import OllamaEmbeddings
from langchain_postgres.vectorstores import PGVector

# Ensure environment variables are loaded
DB_USER = os.getenv("POSTGRES_USER", "postgres")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres")
DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = os.getenv("POSTGRES_PORT", "5432")
DB_NAME = os.getenv("POSTGRES_DB", "paladio")
OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# psycopg3 URL format for SQLAlchemy
CONNECTION_STRING = (
    f"postgresql+psycopg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)
COLLECTION_NAME = "madrid_pois"

MOCK_POIS = [
    # Hotels
    {
        "name": "Hotel Riu Plaza España",
        "description": "A luxury hotel located in the iconic Edificio España right on Plaza de España. Features a stunning rooftop pool and 360-degree views of Madrid.",
        "category": "HOTEL",
        "cost_eur": 150.0,
        "duration_mins": 0,
        "lat": 40.4233,
        "lon": -3.7122,
    },
    {
        "name": "Hostal Centro Historico",
        "description": "Budget friendly hostel in the heart of Madrid, right next to Puerta del Sol. Great base of operations for a low budget trip.",
        "category": "HOTEL",
        "cost_eur": 35.0,
        "duration_mins": 0,
        "lat": 40.4168,
        "lon": -3.7038,
    },
    # Museums & Attractions
    {
        "name": "Museo del Prado",
        "description": "The main Spanish national art museum, widely considered to have one of the world's finest collections of European art.",
        "category": "MUSEUM",
        "cost_eur": 15.0,
        "duration_mins": 180,
        "lat": 40.4138,
        "lon": -3.6921,
    },
    {
        "name": "Reina Sofia Museum",
        "description": "Spain's national museum of 20th-century art, famous for housing Picasso's Guernica.",
        "category": "MUSEUM",
        "cost_eur": 12.0,
        "duration_mins": 120,
        "lat": 40.4079,
        "lon": -3.6946,
    },
    {
        "name": "Thyssen-Bornemisza Museum",
        "description": "An art museum filling the historical gaps in its counterparts' collections, spanning from early painters to pop art.",
        "category": "MUSEUM",
        "cost_eur": 13.0,
        "duration_mins": 120,
        "lat": 40.4161,
        "lon": -3.6949,
    },
    {
        "name": "Royal Palace of Madrid",
        "description": "The official residence of the Spanish royal family at the city of Madrid, although now used only for state ceremonies.",
        "category": "LANDMARK",
        "cost_eur": 14.0,
        "duration_mins": 120,
        "lat": 40.4180,
        "lon": -3.7143,
    },
    {
        "name": "Retiro Park",
        "description": "One of the largest parks of the city of Madrid, featuring the Crystal Palace and a beautiful boating lake.",
        "category": "PARK",
        "cost_eur": 0.0,
        "duration_mins": 90,
        "lat": 40.4153,
        "lon": -3.6845,
    },
    {
        "name": "Plaza Mayor",
        "description": "A major public space in the heart of Madrid, once the center of Old Madrid. Famous for its symmetrical architecture.",
        "category": "LANDMARK",
        "cost_eur": 0.0,
        "duration_mins": 45,
        "lat": 40.4155,
        "lon": -3.7074,
    },
    {
        "name": "Santiago Bernabéu Stadium",
        "description": "The home stadium of Real Madrid. Offers an immersive tour of the museum, pitch, and locker rooms.",
        "category": "ATTRACTION",
        "cost_eur": 25.0,
        "duration_mins": 120,
        "lat": 40.4531,
        "lon": -3.6883,
    },
    {
        "name": "Temple of Debod",
        "description": "An ancient Egyptian temple that was dismantled and rebuilt in Madrid. Excellent spot for sunset views.",
        "category": "LANDMARK",
        "cost_eur": 0.0,
        "duration_mins": 45,
        "lat": 40.4240,
        "lon": -3.7177,
    },
    # Restaurants & Bars
    {
        "name": "Sobrino de Botín",
        "description": "The oldest restaurant in the world continuously operating. Famous for its roast suckling pig (cochinillo asado).",
        "category": "RESTAURANT",
        "cost_eur": 50.0,
        "duration_mins": 90,
        "lat": 40.4143,
        "lon": -3.7075,
    },
    {
        "name": "Mercado de San Miguel",
        "description": "A historic covered market offering gourmet tapas, wine, and local delicacies.",
        "category": "RESTAURANT",
        "cost_eur": 25.0,
        "duration_mins": 60,
        "lat": 40.4154,
        "lon": -3.7090,
    },
    {
        "name": "Chocolatería San Ginés",
        "description": "Famous 24/7 cafe serving traditional Spanish churros and thick hot chocolate since 1894.",
        "category": "BAR",  # Using BAR as a generic quick food/rest stop
        "cost_eur": 8.0,
        "duration_mins": 45,
        "lat": 40.4168,
        "lon": -3.7067,
    },
    {
        "name": "Taberna La Carmencita",
        "description": "The second oldest tavern in Madrid, beautifully restored with traditional azulejo tiles. Excellent traditional Spanish food.",
        "category": "RESTAURANT",
        "cost_eur": 35.0,
        "duration_mins": 90,
        "lat": 40.4223,
        "lon": -3.6976,
    },
    {
        "name": "Cervecería Cervantes",
        "description": "A bustling traditional tapas bar famous for its draft beer, seafood, and classic Madrid atmosphere.",
        "category": "BAR",
        "cost_eur": 15.0,
        "duration_mins": 45,
        "lat": 40.4145,
        "lon": -3.6958,
    },
    # Transport Hubs
    {
        "name": "Madrid Barajas Airport (MAD)",
        "description": "The main international airport serving Madrid, located about 12 km from the city center.",
        "category": "AIRPORT",
        "cost_eur": 0.0,  # Cost to be at airport is 0, transit is calculated separately
        "duration_mins": 120,  # Time needed before departure
        "lat": 40.4719,
        "lon": -3.5626,
    },
    {
        "name": "Atocha Railway Station",
        "description": "The largest railway station in Madrid. Features a beautiful indoor botanical garden.",
        "category": "TRANSIT",
        "cost_eur": 0.0,
        "duration_mins": 30,
        "lat": 40.4065,
        "lon": -3.6896,
    },
]


def main():
    print(f"Connecting to Postgres at {CONNECTION_STRING}")
    print(f"Using Ollama at {OLLAMA_URL}")

    embeddings = OllamaEmbeddings(model="nomic-embed-text", base_url=OLLAMA_URL)

    vectorstore = PGVector(
        embeddings=embeddings,
        collection_name=COLLECTION_NAME,
        connection=CONNECTION_STRING,
        use_jsonb=True,
    )

    docs = []
    for poi in MOCK_POIS:
        # Create a rich text representation for the embedding to capture intent
        page_content = (
            f"Name: {poi['name']}\n"
            f"Category: {poi['category']}\n"
            f"Description: {poi['description']}\n"
            f"Cost: {poi['cost_eur']} EUR\n"
            f"Duration: {poi['duration_mins']} minutes"
        )

        metadata = {
            "name": poi["name"],
            "category": poi["category"],
            "cost_eur": poi["cost_eur"],
            "duration_mins": poi["duration_mins"],
            "lat": poi["lat"],
            "lon": poi["lon"],
        }

        docs.append(Document(page_content=page_content, metadata=metadata))

    print(f"Adding {len(docs)} POIs to vectorstore...")

    # Optional: Clear existing collection if we want a fresh start
    vectorstore.drop_tables()
    vectorstore.create_tables_if_not_exists()

    vectorstore.add_documents(docs)
    print("Successfully seeded POIs!")


if __name__ == "__main__":
    main()
