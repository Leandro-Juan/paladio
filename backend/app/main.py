from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

# Initialize FastAPI App
app = FastAPI(
    title="Paladio Semantic Gateway",
    description="Gateway for the Continuous Sovereign Travel Optimization Engine",
    version="1.0.0"
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

@app.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        # Placeholder for LangGraph multi-agent swarm stream
        await websocket.send_json({"event": "INICIANDO_INFERENCIA", "status": "pending"})
        # ... processing logic
        await websocket.send_json({"event": "EVALUANDO_RUTAS", "status": "running"})
    except Exception as e:
        await websocket.close(code=1011, reason=str(e))
