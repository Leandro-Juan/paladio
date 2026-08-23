import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from langchain_core.messages import HumanMessage
from app.infrastructure.engine.bridge_adapter import OptimizationError, CppOptimizationAdapter
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    graph = websocket.app.state.graph
    
    try:
        while True:
            # Wait for user input
            text_data = await websocket.receive_text()
            
            try:
                # Try parsing as JSON first, otherwise use raw text
                data = json.loads(text_data)
                action = data.get("action", "chat")
                user_msg = data.get("message", "")
                
                if action == "feedback":
                    poi = data.get("poi", {})
                    target_score = float(data.get("target_score", 50.0))
                    user_id = data.get("user_id", "default_user")
                    
                    # Update User embedding
                    from app.engine.scoring.features import PoiEncoder
                    
                    user_store = websocket.app.state.user_store
                    ml_params = websocket.app.state.ml_params
                    ml_model = websocket.app.state.ml_model
                    
                    poi_embedding = PoiEncoder.encode(poi)
                    user_emb = user_store.get_embedding(user_id)
                    updated_emb = ml_model.update_user(ml_params, user_emb, poi_embedding, target_score)
                    user_store.save_embedding(user_id, updated_emb)
                    
                    await websocket.send_json({"event": "FEEDBACK_PROCESSED", "status": "completed"})
                    continue
                    
            except json.JSONDecodeError:
                user_msg = text_data
                
            if not user_msg:
                continue
                
            await websocket.send_json({"event": "STARTING_INFERENCE", "status": "running"})
            
            initial_state = {
                "messages": [HumanMessage(content=user_msg)],
                "error_count": 0
            }
            
            engine = CppOptimizationAdapter(
                ml_model=websocket.app.state.ml_model,
                ml_params=websocket.app.state.ml_params,
                user_store=websocket.app.state.user_store
            )
            
            config = {"configurable": {"engine": engine}}
            
            # Stream the LangGraph execution
            async for chunk in graph.astream(initial_state, config=config, stream_mode="updates"):
                # chunk is a dict like {"node_name": {"state_key": state_value}}
                for node_name, state_update in chunk.items():
                    
                    if node_name == "router":
                        intent = state_update.get("intent", "UNKNOWN")
                        await websocket.send_json({"event": "ROUTING_INTENT", "status": "completed", "data": intent})
                        
                    elif node_name == "rag":
                        retrieved = state_update.get("retrieved_context", "")
                        # Send truncated context to avoid massive payloads
                        truncated = retrieved[:500] + "..." if len(retrieved) > 500 else retrieved
                        await websocket.send_json({"event": "RETRIEVING_CONTEXT", "status": "completed", "data": truncated})
                    
                    elif node_name == "validator":
                        constraints = state_update.get("validated_itinerary")
                        await websocket.send_json({"event": "EXTRACTING_CONSTRAINTS", "status": "completed", "data": constraints.model_dump(mode="json") if constraints else None})
                        
                    elif node_name == "planner":
                        final_itinerary = state_update.get("final_itinerary", {})
                        if "error" in final_itinerary:
                            await websocket.send_json({"event": "ERROR", "status": final_itinerary["error"]})
                        else:
                            await websocket.send_json({"event": "EVALUATING_ROUTES", "status": "completed", "data": final_itinerary})
                            
                    elif node_name == "alert":
                        final_itinerary = state_update.get("final_itinerary", {})
                        await websocket.send_json({"event": "ALERT_SCHEDULED", "status": "completed", "data": final_itinerary})

            await websocket.send_json({"event": "DONE", "status": "completed"})
            
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except OptimizationError as e:
        logger.error(f"Optimization error: {e}")
        await websocket.send_json({"event": "ERROR", "status": str(e)})
        await websocket.close(code=1011, reason=str(e))
    except Exception as e:
        logger.error(f"Internal server error: {e}")
        error_msg = str(e)[:123] # WebSocket max reason length is 123 bytes
        await websocket.close(code=1011, reason=error_msg)
