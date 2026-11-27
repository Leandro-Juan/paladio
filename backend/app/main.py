import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.calendar import router as calendar_router
from app.api.currency import router as currency_router
from app.api.locations import router as locations_router
from app.api.market import router as market_router
from app.api.pois import router as pois_router
from app.api.system import router as system_router
from app.api.transit import router as transit_router
from app.api.trips import router as trips_router
from app.api.users import router as users_router
from app.api.weather import router as weather_router
from app.api.websockets import router as websockets_router
from app.infrastructure.scoring.hybrid_scorer import HybridSovereignScorer
from app.services.trip_generation_manager import TripGenerationManager
from app.swarm.graph import create_swarm
from app.agent import trip_agent_router

try:
    from app.mcp import mount_mcp_app
except (ImportError, Exception):
    mount_mcp_app = None

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB connections, LangGraph checkpointers, etc. here
    logger.info("Initializing Semantic Gateway Lifespan...")
    app.state.graph = create_swarm()

    # Initialize Sovereign Hybrid Recommender in App State
    app.state.ml_model = HybridSovereignScorer()
    app.state.ml_params = app.state.ml_model.init_params()

    # Dynamically fetch live currency exchange rates
    try:
        from app.engine.currency import fetch_live_rates

        rates = await fetch_live_rates("USD")
        app.state.exchange_rate_usd_eur = rates.get("EUR", 1.0)
        logger.info(
            f"Dynamically initialized USD to EUR rate: {app.state.exchange_rate_usd_eur}"
        )
    except Exception as e:
        import asyncio

        if isinstance(e, asyncio.CancelledError):
            raise
    # Dynamically initialize POI price catalog and city currencies from PostgreSQL
    try:
        from app.db.session import async_session
        from app.services.poi_pricing_service import PoiPricingService

        async with async_session() as db_session:
            await PoiPricingService.load_catalog_from_db(db_session)
        logger.info(
            "Dynamically initialized POI price catalog and city currencies from PostgreSQL"
        )
    except Exception as e:
        logger.warning(f"Could not initialize catalog from DB on startup: {e}")

    # Dynamically initialize active LLM configuration from PostgreSQL
    try:
        from app.db.session import async_session
        from app.services.llm_service import LLMService

        async with async_session() as db_session:
            active_llm_cfg = await LLMService.get_config_from_db(db_session)
        logger.info(
            f"Dynamically initialized LLM Service: {active_llm_cfg.provider} / {active_llm_cfg.model}"
        )
    except Exception as e:
        logger.warning(
            f"Could not initialize LLM configuration from DB on startup: {e}"
        )

    # Dynamically initialize external API secrets from PostgreSQL
    try:
        from app.db.session import async_session
        from app.db.models import SystemConfigModel
        from app.engine.market.config import set_runtime_aviasales_token
        from sqlalchemy import select

        async with async_session() as db_session:
            res = await db_session.execute(
                select(SystemConfigModel).where(SystemConfigModel.key == "secrets")
            )
            rec = res.scalar_one_or_none()
            if rec and isinstance(rec.value, dict):
                av_token = rec.value.get("aviasales", {}).get("token")
                if av_token is not None:
                    set_runtime_aviasales_token(av_token)
                    logger.info(
                        "Dynamically initialized Aviasales API token from database"
                    )
    except Exception as e:
        logger.warning(f"Could not initialize secrets from DB on startup: {e}")

    app.state.trip_generation_manager = TripGenerationManager(app)
    try:
        reconciled = (
            await app.state.trip_generation_manager.reconcile_interrupted_jobs()
        )
        if reconciled:
            logger.info(
                f"Reconciled {reconciled} interrupted trip generation job(s) on startup"
            )
    except Exception as e:
        logger.warning(f"Could not reconcile interrupted trip generation jobs: {e}")

    yield
    # Cleanup here
    logger.info("Shutting down Semantic Gateway...")
    if (
        hasattr(app.state, "trip_generation_manager")
        and app.state.trip_generation_manager
    ):
        await app.state.trip_generation_manager.shutdown()


# Initialize FastAPI App
app = FastAPI(
    title="Paladio Semantic Gateway",
    description="Gateway for the Continuous Sovereign Travel Optimization Engine",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Middleware for local web UI
allowed_origins_env = (os.environ.get("ALLOWED_ORIGINS") or "").strip()
if allowed_origins_env:
    allowed_origins = [
        origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()
    ]
    allow_origin_regex = None
else:
    frontend_port = (os.environ.get("FRONTEND_PORT") or "3000").strip()
    allowed_origins = [
        f"http://localhost:{frontend_port}",
        f"http://127.0.0.1:{frontend_port}",
    ]
    if frontend_port != "3000":
        allowed_origins.extend(["http://localhost:3000", "http://127.0.0.1:3000"])
    allow_origin_regex = (
        r"^https?://(localhost|127\.0\.0\.1|\[::1\]|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"[a-zA-Z0-9-]+\.local)(:\d+)?$"
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "Paladio Gateway"}


# Include canonical unversioned routers
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(users_router, prefix="/api/users", tags=["users"])
app.include_router(websockets_router, prefix="/api", tags=["stream"])
app.include_router(trips_router, prefix="/api/trips", tags=["trips"])
app.include_router(currency_router, prefix="/api/currency", tags=["currency"])
app.include_router(pois_router, prefix="/api/pois", tags=["pois"])
app.include_router(market_router, prefix="/api/market", tags=["market"])
app.include_router(locations_router, prefix="/api/locations", tags=["locations"])
app.include_router(transit_router, prefix="/api", tags=["transit"])
app.include_router(calendar_router, prefix="/api/calendar", tags=["calendar"])
app.include_router(weather_router, prefix="/api/weather", tags=["weather"])
app.include_router(system_router, prefix="/api/system", tags=["system"])
app.include_router(trip_agent_router)

# Mount FastMCP server at /mcp
if mount_mcp_app:
    try:
        mount_mcp_app(app, "/mcp")
    except Exception as e:
        logger.warning(f"Could not mount MCP app: {e}")
