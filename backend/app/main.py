import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.auth import router as auth_router
from app.api.v1.trips import router as trips_router
from app.api.v1.users import router as users_router
from app.api.v1.websockets import router as websockets_router
from app.infrastructure.scoring.jax_ml_model import JaxScoringModel
from app.swarm.graph import create_swarm
import httpx

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB connections, LangGraph checkpointers, etc. here
    logger.info("Initializing Semantic Gateway Lifespan...")
    app.state.graph = create_swarm()

    # Initialize ML Models in App State to avoid horizontal scaling issues
    app.state.ml_model = JaxScoringModel()
    app.state.ml_params = app.state.ml_model.init_params()

    # Fetch currency exchange rate
    app.state.exchange_rate_usd_eur = 0.92
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.frankfurter.app/latest?from=USD&to=EUR"
            )
            if resp.status_code == 200:
                app.state.exchange_rate_usd_eur = resp.json()["rates"]["EUR"]
                logger.info(
                    f"Fetched USD to EUR rate: {app.state.exchange_rate_usd_eur}"
                )
    except Exception as e:
        import asyncio

        if isinstance(e, asyncio.CancelledError):
            raise
        logger.error(f"Failed to fetch exchange rate, using default 0.92. Error: {e}")

    yield
    # Cleanup here
    logger.info("Shutting down Semantic Gateway...")


# Initialize FastAPI App
app = FastAPI(
    title="Paladio Semantic Gateway",
    description="Gateway for the Continuous Sovereign Travel Optimization Engine",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Middleware for local web UI
allowed_origins_env = os.environ.get("ALLOWED_ORIGINS")
allowed_origins = (
    [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
    if allowed_origins_env
    else ["http://localhost:3000", "http://127.0.0.1:3000"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "Paladio Gateway"}


# Include routers
app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users_router, prefix="/api/v1/users", tags=["users"])
app.include_router(websockets_router, prefix="/api/v1", tags=["stream"])
app.include_router(trips_router, prefix="/api/v1/trips", tags=["trips"])
