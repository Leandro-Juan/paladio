import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from langchain_core.messages import HumanMessage
from app.engine.bridge import OptimizationError

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
                user_msg = data.get("message", "")
            except json.JSONDecodeError:
                user_msg = text_data
                
            if not user_msg:
                continue
                
            await websocket.send_json({"event": "STARTING_INFERENCE", "status": "running"})
            
            initial_state = {
                "messages": [HumanMessage(content=user_msg)],
                "error_count": 0
            }
            
            # Stream the LangGraph execution
            async for chunk in graph.astream(initial_state, stream_mode="updates"):
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
        print("WebSocket client disconnected")
    except OptimizationError as e:
        print(f"Optimization error: {e}")
        await websocket.send_json({"event": "ERROR", "status": str(e)})
        await websocket.close(code=1011, reason=str(e))
    except Exception as e:
        print(f"Internal server error: {e}")
        error_msg = str(e)[:123] # WebSocket max reason length is 123 bytes
        await websocket.close(code=1011, reason=error_msg)
