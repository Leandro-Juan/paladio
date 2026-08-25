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
            
            data = {}
            action = "chat"
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
            
            import os
            from pathlib import Path
            test_data_path = Path(__file__).parent.parent.parent.parent / "tests" / "test_data.json"
            test_data = {}
            if test_data_path.exists():
                try:
                    with open(test_data_path, 'r') as f:
                        test_data = json.load(f)
                        # The user requested to use the real database for POIs, 
                        # so we strip them from the mock data to force a DB fetch.
                        if "pois" in test_data:
                            del test_data["pois"]
                except Exception as e:
                    logger.error(f"Failed to load test_data: {e}")

            initial_state = {
                "messages": [HumanMessage(content=user_msg)],
                "error_count": 0,
                "test_data": test_data
            }
            
            engine = CppOptimizationAdapter(
                ml_model=websocket.app.state.ml_model,
                ml_params=websocket.app.state.ml_params,
                user_store=websocket.app.state.user_store
            )
            
            import uuid
            # Keep thread_id consistent for a session if possible. For simplicity here, we generate a new one unless provided.
            thread_id = data.get("thread_id", str(uuid.uuid4()))
            config = {"configurable": {"engine": engine, "thread_id": thread_id}}
            
            from langgraph.types import Command
            
            # Stream the LangGraph execution
            stream_input = Command(resume={"origin_city": user_msg, "destination_city": user_msg, "budget_usd": user_msg, "start_date": user_msg, "end_date": user_msg, "clarification_needed": None}) if action == "resume" else initial_state
            
            # Actually, to properly resume a graph interrupt waiting for a dict:
            if action == "resume":
                # Assuming the user just types the missing info, we pass it back. 
                # A robust frontend would send a structured JSON. 
                # For testing, we just try to parse it or pass a generic dict.
                try:
                    parsed_msg = json.loads(user_msg)
                    resume_data = parsed_msg
                except Exception:
                    resume_data = {
                        "clarification_response": user_msg,
                        "origin_city": user_msg,
                        "destination_city": user_msg,
                        "budget_usd": user_msg,
                        "start_date": user_msg,
                        "end_date": user_msg
                    }
                stream_input = Command(resume=resume_data)

            async for chunk in graph.astream(stream_input, config=config, stream_mode="updates"):
                if "__interrupt__" in chunk:
                    interrupt_data = chunk["__interrupt__"]
                    question = interrupt_data[0].value if interrupt_data else "Please clarify your request."
                    await websocket.send_json({"event": "CLARIFICATION_NEEDED", "status": "completed", "data": question, "thread_id": thread_id})
                    break

                # chunk is a dict like {"node_name": {"state_key": state_value}}
                for node_name, state_update in chunk.items():
                    if not isinstance(state_update, dict):
                        continue
                    
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
                        if constraints:
                            data = constraints.model_dump(mode="json") if hasattr(constraints, "model_dump") else constraints
                        else:
                            data = None
                        await websocket.send_json({"event": "EXTRACTING_CONSTRAINTS", "status": "completed", "data": data})
                        
                    elif node_name == "check_missing":
                        await websocket.send_json({"event": "CHECKING_MISSING_FIELDS", "status": "completed"})
                        
                    elif node_name == "planner_fetch":
                        await websocket.send_json({"event": "FETCHING_STATIC_DATA", "status": "completed"})
                        
                    elif node_name == "planner_scrape":
                        pois = state_update.get("pois_data", [])
                        await websocket.send_json({"event": "SCRAPING_DYNAMIC_DATA", "status": "completed", "data": f"Fetched {len(pois)} POIs, Flight info..."})
                        
                    elif node_name == "planner_optimize":
                        final_itinerary = state_update.get("final_itinerary", {})
                        if "error" in final_itinerary:
                            await websocket.send_json({"event": "ERROR", "status": final_itinerary["error"]})
                        else:
                            await websocket.send_json({"event": "EVALUATING_ROUTES", "status": "completed", "data": final_itinerary})
                            
                    elif node_name == "alert":
                        final_itinerary = state_update.get("final_itinerary", {})
                        await websocket.send_json({"event": "ALERT_SCHEDULED", "status": "completed", "data": final_itinerary})
            else:
                # Only send DONE if the loop wasn't broken by an interrupt
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
