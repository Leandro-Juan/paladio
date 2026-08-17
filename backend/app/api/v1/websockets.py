import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from langchain_core.messages import HumanMessage

router = APIRouter()

@router.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # We delay the import so that app lifespan can initialize any DB connections first
    from app.swarm.graph import graph
    
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
                    
                    if node_name == "rag":
                        await websocket.send_json({"event": "RETRIEVING_CONTEXT", "status": "completed"})
                    
                    elif node_name == "validator":
                        await websocket.send_json({"event": "EXTRACTING_CONSTRAINTS", "status": "completed"})
                        
                    elif node_name == "planner":
                        final_itinerary = state_update.get("final_itinerary", {})
                        if "error" in final_itinerary:
                            await websocket.send_json({"event": "ERROR", "status": final_itinerary["error"]})
                        else:
                            await websocket.send_json({"event": "EVALUATING_ROUTES", "status": "completed", "data": final_itinerary})
                            
            await websocket.send_json({"event": "DONE", "status": "completed"})
            
    except WebSocketDisconnect:
        print("WebSocket client disconnected")
    except Exception as e:
        await websocket.close(code=1011, reason=str(e))
