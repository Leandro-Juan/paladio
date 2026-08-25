import { useState, useEffect, useRef, useCallback } from 'react';

export type SocketStatus = 'disconnected' | 'connected' | 'inferencing' | 'error';

export interface PaladioEvent {
  event: string;
  status: string;
  data?: any;
}

export function usePaladioSocket() {
  const [status, setStatus] = useState<SocketStatus>('disconnected');
  const [logs, setLogs] = useState<string[]>(['> SYSTEM READY. AWAITING INITIALIZATION.']);
  const [itinerary, setItinerary] = useState<any>(null);
  
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const wsUrl = `${protocol}//${host}:8000/api/v1/ws/stream`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      addLog('> [NETWORK] UPLINK ESTABLISHED WITH PALADIO GATEWAY.');
    };

    ws.onmessage = (event) => {
      try {
        const payload: PaladioEvent = JSON.parse(event.data);
        handleEvent(payload);
      } catch (err) {
        addLog(`> [ERROR] FAILED TO PARSE INCOMING TELEMETRY.`);
      }
    };

    ws.onclose = (event) => {
      setStatus('disconnected');
      if (event.code !== 1000) {
        addLog(`> [NETWORK] UPLINK LOST. (CODE: ${event.code})`);
      }
    };

    ws.onerror = () => {
      setStatus('error');
      addLog('> [ERROR] WEBSOCKET CONNECTION FAILED.');
    };
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close(1000);
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, msg]);
  };

  const handleEvent = (payload: PaladioEvent) => {
    switch (payload.event) {
      case 'STARTING_INFERENCE':
        setStatus('inferencing');
        setItinerary(null);
        addLog('> [ENGINE] INITIALIZING LANGGRAPH SWARM...');
        break;
      case 'ROUTING_INTENT':
        addLog(`> [ROUTER] INTENT DETECTED: ${payload.data}`);
        break;
      case 'RETRIEVING_CONTEXT':
        addLog(`> [RAG] CONTEXT RETRIEVED (TRUNCATED): ${payload.data}`);
        break;
      case 'EXTRACTING_CONSTRAINTS':
        addLog(`> [VALIDATOR] CONSTRAINTS EXTRACTED. PREPARING C++ SOLVER.`);
        break;
      case 'EVALUATING_ROUTES':
        addLog(`> [PLANNER] ITINERARY GENERATED.`);
        setItinerary(payload.data);
        break;
      case 'FEEDBACK_PROCESSED':
        addLog(`> [MODEL] JAX EMBEDDINGS UPDATED FROM FEEDBACK.`);
        break;
      case 'ERROR':
        setStatus('error');
        addLog(`> [CRITICAL ERROR] ${payload.status}`);
        break;
      case 'DONE':
        setStatus('connected');
        addLog('> [ENGINE] INFERENCE CYCLE COMPLETE. IDLE.');
        break;
      default:
        addLog(`> [TELEMETRY] ${payload.event}: ${payload.status}`);
    }
  };

  const sendMessage = (message: string) => {
    addLog(`> [USER] ${message}`);

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addLog('> [ERROR] CANNOT SEND. UPLINK OFFLINE.');
      return;
    }
    
    const payload = {
      action: 'chat',
      message
    };
    wsRef.current.send(JSON.stringify(payload));
  };

  const sendFeedback = (poi: any, targetScore: number, userId: string = 'default_user') => {
    addLog(`> [USER] TUNING MODEL... ADJUSTING AFFINITY FOR: ${poi.name || 'POI'}`);
    
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addLog('> [ERROR] CANNOT SEND FEEDBACK. UPLINK OFFLINE.');
      return;
    }
    
    const payload = {
      action: 'feedback',
      poi,
      target_score: targetScore,
      user_id: userId
    };
    wsRef.current.send(JSON.stringify(payload));
  };

  return {
    status,
    logs,
    itinerary,
    sendMessage,
    sendFeedback,
    connect,
    disconnect
  };
}
