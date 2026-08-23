from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.websockets import router as websockets_router
from app.swarm.graph import create_swarm
import logging

logger = logging.getLogger(__name__)

from app.infrastructure.scoring.jax_ml_model import JaxScoringModel
from app.engine.scoring.features import UserStore

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB connections, LangGraph checkpointers, etc. here
    logger.info("Initializing Semantic Gateway Lifespan...")
    app.state.graph = create_swarm()
    
    # Initialize ML Models in App State to avoid horizontal scaling issues
    app.state.ml_model = JaxScoringModel()
    app.state.ml_params = app.state.ml_model.init_params()
    app.state.user_store = UserStore()
    
    yield
    # Cleanup here
    logger.info("Shutting down Semantic Gateway...")

# Initialize FastAPI App
app = FastAPI(
    title="Paladio Semantic Gateway",
    description="Gateway for the Continuous Sovereign Travel Optimization Engine",
    version="1.0.0",
    lifespan=lifespan
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
