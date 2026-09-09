"use client";

import React, { createContext, useState, useEffect, useRef, useCallback } from 'react';

export type SocketStatus = 'disconnected' | 'connected' | 'inferencing' | 'error' | 'awaiting_input';

export interface PaladioEvent {
  event: string;
  status: string;
  data?: Record<string, unknown>;
}

import { OptimizationResult, Poi } from '../types/domain';

import { create } from 'zustand';

interface LogStore {
  logs: string[];
  addLog: (msg: string) => void;
  clearLogs: () => void;
  initLogs: () => void;
}

export const useLogStore = create<LogStore>((set) => ({
  logs: ['> SYSTEM READY. AWAITING INITIALIZATION.'],
  addLog: (msg) => set((state) => {
    const replayable = [
      '> [VALIDATOR] CONSTRAINTS EXTRACTED. PREPARING C++ SOLVER.',
      '> [PLANNER] ITINERARY GENERATED.',
      '> [ENGINE] INFERENCE CYCLE COMPLETE. IDLE.'
    ];
    if (replayable.includes(msg) && state.logs.includes(msg)) return state;
    const newLogs = [...state.logs, msg];
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('paladio_logs', JSON.stringify(newLogs));
    }
    return { logs: newLogs };
  }),
  clearLogs: () => {
    const newLogs = ['> SYSTEM READY. AWAITING INITIALIZATION.'];
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('paladio_logs', JSON.stringify(newLogs));
    }
    set({ logs: newLogs });
  },
  initLogs: () => {
    if (typeof window !== 'undefined') {
      const savedStatus = sessionStorage.getItem('paladio_status');
      if (savedStatus === 'connected' || savedStatus === 'error') {
         sessionStorage.removeItem('paladio_logs');
         set({ logs: ['> SYSTEM READY. AWAITING INITIALIZATION.'] });
      } else {
        const saved = sessionStorage.getItem('paladio_logs');
        if (saved) {
          try {
            set({ logs: JSON.parse(saved) });
          } catch (e) {}
        }
      }
    }
  }
}));
export interface SocketContextProps {
  status: SocketStatus;
  itinerary: OptimizationResult | null;
  missingFields: string[];
  sendMessage: (msg: string) => void;
  sendFeedback: (poi: Poi, targetScore: number, userId?: string) => void;
  sendResume: (data: Record<string, string>) => void;
  connect: () => void;
  disconnect: () => void;
}

export const SocketContext = createContext<SocketContextProps | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SocketStatus>(() => {
    if (typeof window !== 'undefined') {
      const savedStatus = sessionStorage.getItem('paladio_status');
      if (savedStatus === 'connected' || savedStatus === 'error') return 'disconnected';
      if (savedStatus) return savedStatus as SocketStatus;
    }
    return 'disconnected';
  });

  const { addLog } = useLogStore.getState();
  useEffect(() => { useLogStore.getState().initLogs(); }, []);

  const [itinerary, setItinerary] = useState<OptimizationResult | null>(() => {
    if (typeof window !== 'undefined') {
      const savedStatus = sessionStorage.getItem('paladio_status');
      if (savedStatus === 'connected' || savedStatus === 'error') return null;
      const saved = sessionStorage.getItem('paladio_itinerary');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          // ignore
        }
      }
    }
    return null;
  });

  const [missingFields, setMissingFields] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const savedStatus = sessionStorage.getItem('paladio_status');
      if (savedStatus === 'connected' || savedStatus === 'error') return [];
      const saved = sessionStorage.getItem('paladio_missing');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          // ignore
        }
      }
    }
    return [];
  });
  
  const wsRef = useRef<WebSocket | null>(null);
  // eslint-disable-next-line react-hooks/purity
  const threadIdRef = useRef<string>(typeof window !== 'undefined' && sessionStorage.getItem('paladio_thread_id') ? sessionStorage.getItem('paladio_thread_id')! : Date.now().toString(36).substring(2, 15));

  useEffect(() => {
    if (typeof window !== 'undefined' && !sessionStorage.getItem('paladio_thread_id')) {
      sessionStorage.setItem('paladio_thread_id', threadIdRef.current);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
            sessionStorage.setItem('paladio_status', status);
      if (itinerary) sessionStorage.setItem('paladio_itinerary', JSON.stringify(itinerary));
      else sessionStorage.removeItem('paladio_itinerary');
      
      if (missingFields.length > 0) sessionStorage.setItem('paladio_missing', JSON.stringify(missingFields));
      else sessionStorage.removeItem('paladio_missing');
    }
  }, [status, itinerary, missingFields]);

  
  
  const handleEvent = useCallback((payload: PaladioEvent) => {
    switch (payload.event) {
      case 'STARTING_INFERENCE':
        setStatus('inferencing');
        setItinerary(null);
        addLog('> [ENGINE] INITIALIZING LANGGRAPH SWARM...');
        break;
      case 'ROUTING_INTENT':
        addLog(`> [ROUTER] INTENT DETECTED: ${payload.data}`);
        break;
      case 'ANALYZING_PROMPT':
        addLog(`> [ANALYZER] ANALYZING USER REQUEST & PREFERENCES...`);
        break;
      case 'RETRIEVING_CONTEXT':
        addLog(`> [RAG] CONTEXT RETRIEVED (TRUNCATED): ${payload.data}`);
        break;
      case 'CLARIFICATION_NEEDED':
        setStatus('awaiting_input');
        if (payload.data && payload.data.fields) {
          setMissingFields(payload.data.fields as string[]);
          addLog(`> [SYSTEM] ${payload.data.message}`);
        } else {
          addLog(`> [SYSTEM] CLARIFICATION NEEDED.`);
        }
        break;
      case 'EXTRACTING_CONSTRAINTS':
        addLog(`> [VALIDATOR] CONSTRAINTS EXTRACTED. PREPARING C++ SOLVER.`);
        break;
      case 'EVALUATING_ROUTES':
        addLog(`> [PLANNER] ITINERARY GENERATED.`);
        setItinerary(payload.data as unknown as OptimizationResult);
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
  }, [addLog]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = process.env.NEXT_PUBLIC_WS_PORT || '8000';
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || `${protocol}//${host}:${port}/api/v1/ws/stream`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus(prev => prev === 'awaiting_input' ? 'awaiting_input' : 'connected');
      addLog('> [NETWORK] UPLINK ESTABLISHED WITH PALADIO GATEWAY.');
      
      ws.send(JSON.stringify({
        action: 'attach',
        thread_id: threadIdRef.current
      }));
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
      setStatus(prev => prev === 'awaiting_input' ? 'awaiting_input' : 'disconnected');
      if (event.code !== 1000) {
        addLog(`> [NETWORK] UPLINK LOST. (CODE: ${event.code})`);
      }
    };

    ws.onerror = () => {
      setStatus('error');
      addLog('> [ERROR] WEBSOCKET CONNECTION FAILED.');
    };
  }, [addLog, handleEvent]);

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

  const sendMessage = useCallback((message: string) => {
    addLog(`> [USER] ${message}`);

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addLog('> [ERROR] CANNOT SEND. UPLINK OFFLINE.');
      return;
    }
    
    const payload = {
      action: 'chat',
      message,
      thread_id: threadIdRef.current
    };
    wsRef.current.send(JSON.stringify(payload));
  }, [addLog]);

  const sendFeedback = useCallback((poi: Partial<Poi>, targetScore: number, userId: string = 'default_user') => {
    addLog(`> [USER] TUNING MODEL... ADJUSTING AFFINITY FOR: ${poi.name || 'POI'}`);
    
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addLog('> [ERROR] CANNOT SEND FEEDBACK. UPLINK OFFLINE.');
      return;
    }
    
    const payload = {
      action: 'feedback',
      poi,
      target_score: targetScore,
      user_id: userId,
      thread_id: threadIdRef.current
    };
    wsRef.current.send(JSON.stringify(payload));
  }, [addLog]);

  const sendResume = useCallback((data: Record<string, string>) => {
    addLog(`> [USER] SUBMITTING REQUIRED FIELDS...`);
    
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addLog('> [ERROR] CANNOT RESUME. UPLINK OFFLINE.');
      return;
    }
    
    setStatus('inferencing');
    setMissingFields([]);
    
    const payload = {
      action: 'resume',
      message: JSON.stringify(data),
      thread_id: threadIdRef.current
    };
    wsRef.current.send(JSON.stringify(payload));
  }, [addLog]);

  return (
    <SocketContext.Provider value={{
      status, itinerary, missingFields, sendMessage, sendFeedback, sendResume, connect, disconnect
    }}>
      {children}
    </SocketContext.Provider>
  );
}
