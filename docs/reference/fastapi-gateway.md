# Reference: FastAPI Gateway

This document provides technical reference for the Semantic Gateway implemented in `backend/app/main.py` and `backend/app/api/v1/websockets.py`.

## Overview

The gateway acts as the primary ingress point for the system. It exposes a health check endpoint and a WebSocket stream endpoint.

## HTTP Endpoints

### `GET /health`
Returns the health status of the gateway.

**Response:**
```json
{
  "status": "ok", 
  "service": "Paladio Gateway"
}
```

### Transit Network Endpoints (`/api/v1/transit` / `/api/transit`)

- **`GET /api/transit/{city}/status`**: Returns GTFS availability, coverage date range, and derived table build status.
- **`GET /api/transit/{city}/nearby`**: Finds nearest stations to trip anchor coordinates (lodging, daily POIs) grouped by anchor with walking duration and serving line badges.
- **`GET /api/transit/{city}/lines`**: Lists all transit lines for a destination city with modes and color palettes.
- **`GET /api/transit/{city}/lines/{line_id}`**: Detailed line pattern, stop sequences, and spatial polyline.
- **`GET /api/transit/{city}/stations/{station_id}`**: Detailed station info, serving lines, directions, wheelchair boarding, and service summaries.
- **`GET /api/transit/{city}/stations/{station_id}/departures`**: Real-time scheduled timetable departures from target date and seconds.
- **`GET /api/transit/{city}/map-stations?bbox=min_lat,min_lon,max_lat,max_lon`**: Returns stations with serving line chips bounded by geographic viewport for interactive map layers.

## WebSocket Streaming Endpoint

### `WS /api/v1/ws/stream`

This endpoint accepts text/JSON input and streams the execution state of the LangGraph swarm back to the client.

#### Client -> Server (Input)
The client must send a JSON payload or raw text containing the user's request.

```json
{
  "message": "Plan a 3-day trip to Madrid with a $500 budget."
}
```

#### Server -> Client (Output Stream)
The server streams progress back as the LangGraph executes. Each chunk is a JSON object with the following structure:

| Event | Status | Data payload | Description |
| :--- | :--- | :--- | :--- |
| `STARTING_INFERENCE` | `running` | `null` | Acknowledges the request. |
| `ROUTING_INTENT` | `completed` | `"REACTIVE_PLANNING"` / `"PROACTIVE_MONITORING"` | The Router agent's classification. |
| `RETRIEVING_CONTEXT` | `completed` | String (Truncated text) | Context fetched by the RAG agent. |
| `EXTRACTING_CONSTRAINTS`| `completed`| JSON object | Strict Pydantic model extracted by the Validator. |
| `EVALUATING_ROUTES` | `completed` | JSON object | The final itinerary from the C++ Planner. |
| `ALERT_SCHEDULED` | `completed` | JSON object | Output from the Alert Node (Proactive Monitoring). |
| `ERROR` | String | `null` | An error occurred during processing. |
| `DONE` | `completed` | `null` | The inference pipeline has finished. |

## Error Handling

If the LangGraph execution or C++ engine throws an `OptimizationError` or any other unhandled exception, the WebSocket will:
1. Emit an `{"event": "ERROR", "status": "<reason>"}` message.
2. Close the connection with code `1011` (Internal Server Error) and append the reason.
