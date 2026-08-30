import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.trips import router as trips_router
from app.api.v1.websockets import router as websockets_router
from app.engine.scoring.features import UserStore
from app.infrastructure.scoring.jax_ml_model import JaxScoringModel
from app.swarm.graph import create_swarm

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB connections, LangGraph checkpointers, etc. here
    logger.info("Initializing Semantic Gateway Lifespan...")
    app.state.graph = create_swarm()

    # Initialize ML Models in App State to avoid horizontal scaling issues
    app.state.ml_model = JaxScoringModel()
    app.state.ml_params = app.state.ml_model.init_params()
    app.state.user_store = UserStore()

    from app.infrastructure.engine.bridge_adapter import CppOptimizationAdapter
    from app.infrastructure.engine.ml_scorer import MLScorer
    from app.infrastructure.swarm.swarm_session_adapter import SwarmSessionAdapter
    from app.infrastructure.swarm.swarm_session_manager import SwarmSessionManager

    ml_scorer = MLScorer(
        ml_model=app.state.ml_model,
        ml_params=app.state.ml_params,
        user_store=app.state.user_store,
    )
    engine = CppOptimizationAdapter(ml_scorer=ml_scorer)

    adapter = SwarmSessionAdapter(
        graph=app.state.graph,
        engine=engine,
        ml_model=app.state.ml_model,
        ml_params=app.state.ml_params,
        user_store=app.state.user_store,
    )
    app.state.swarm_manager = SwarmSessionManager(adapter)

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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "Paladio Gateway"}


# Include routers
app.include_router(websockets_router, prefix="/api/v1", tags=["stream"])
app.include_router(trips_router, prefix="/api/v1/trips", tags=["trips"])
