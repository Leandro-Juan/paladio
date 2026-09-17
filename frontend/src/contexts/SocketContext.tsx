"use client";

import React, { createContext, useState, useEffect, useRef, useCallback } from 'react';

export type SocketStatus = 'disconnected' | 'connected' | 'inferencing' | 'error' | 'awaiting_input';

export interface PaladioEvent {
  event: string;
  status: string;
  data?: Record<string, unknown>;
  message?: string;
  city?: string;
  city_name?: string;
  trip_id?: string;
}

import { OptimizationResult, Poi } from '../types/domain';
import { notify } from '@/utils/notify';

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
      '> [PLANNER] OPTIMIZING ROUTES & TRANSIT WITH C++ SOLVER...',
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
          } catch {}
        }
      }
    }
  }
}));
export interface SocketContextProps {
  status: SocketStatus;
  itinerary: OptimizationResult | null;
  missingFields: string[];
  sendMessage: (msg: string, payloadExtras?: Record<string, unknown>) => void;
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
      if (savedStatus === 'error') return null;
      const saved = sessionStorage.getItem('paladio_itinerary');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
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
        } catch {
          // ignore
        }
      }
    }
    return [];
  });
  
  const wsRef = useRef<WebSocket | null>(null);
  const threadIdRef = useRef<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('paladio_thread_id');
      const tid = stored || Date.now().toString(36).substring(2, 15);
      threadIdRef.current = tid;
      if (!stored) {
        sessionStorage.setItem('paladio_thread_id', tid);
      }
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
      case 'PARSING_TICKETS':
        addLog(`> [PARSER] BOOKING ANCHORS PROCESSED.`);
        break;
      case 'CHECKING_MISSING_FIELDS':
        addLog(`> [VALIDATOR] VALIDATING TRIP CONSTRAINTS...`);
        break;
      case 'ROUTING_INTENT':
        addLog(`> [ROUTER] INTENT DETECTED: ${payload.data}`);
        break;
      case 'ANALYZING_PROMPT':
        addLog(`> [ANALYZER] ANALYZING USER REQUEST & PREFERENCES...`);
        break;
      case 'SCRAPING_DYNAMIC_DATA':
        addLog(`> [PLANNER] ${payload.data || 'FETCHING POIS & TRANSIT...'}`);
        break;
      case 'RETRIEVING_CONTEXT':
        addLog(`> [RAG] CONTEXT RETRIEVED (TRUNCATED): ${payload.data}`);
        break;
      case 'CLARIFICATION_NEEDED':
        setStatus('awaiting_input');
        if (payload.data && payload.data.fields) {
          setMissingFields(payload.data.fields as string[]);
          addLog(`> [SYSTEM] ${payload.data.message}`);
          notify.warning('Input Required', (payload.data.message as string) || 'Solver requires additional constraints.', {
            actionLink: '/engine',
            actionLabel: 'Open Engine',
          });
        } else {
          addLog(`> [SYSTEM] CLARIFICATION NEEDED.`);
          notify.warning('Input Required', 'Clarification needed to proceed with itinerary optimization.', {
            actionLink: '/engine',
            actionLabel: 'Open Engine',
          });
        }
        break;
      case 'EXTRACTING_CONSTRAINTS':
        addLog(`> [VALIDATOR] CONSTRAINTS EXTRACTED. PREPARING C++ SOLVER.`);
        break;
      case 'EVALUATING_ROUTES':
        if ((payload.status === 'completed' || payload.status === 'recovered') && payload.data) {
          addLog(`> [PLANNER] ITINERARY GENERATED.`);
          let incoming = payload.data as unknown as OptimizationResult;
          if (typeof window !== 'undefined') {
            try {
              const cached = sessionStorage.getItem('paladio_itinerary');
              if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed?.is_upgraded) {
                  incoming = {
                    ...incoming,
                    is_upgraded: true,
                    metadata: { ...incoming.metadata, transit_upgraded: true }
                  };
                }
              }
            } catch {
              // ignore
            }
          }
          setItinerary(incoming);
          notify.success('Itinerary Generated', 'Continuous Sovereign Travel plan is ready for review.', {
            actionLink: '/vault',
            actionLabel: 'View Itinerary',
          });
        } else if (payload.status === 'running') {
          addLog(`> [PLANNER] OPTIMIZING ROUTES & TRANSIT WITH C++ SOLVER...`);
        } else if (payload.data) {
          addLog(`> [PLANNER] ITINERARY GENERATED.`);
          let incoming = payload.data as unknown as OptimizationResult;
          if (typeof window !== 'undefined') {
            try {
              const cached = sessionStorage.getItem('paladio_itinerary');
              if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed?.is_upgraded) {
                  incoming = {
                    ...incoming,
                    is_upgraded: true,
                    metadata: { ...incoming.metadata, transit_upgraded: true }
                  };
                }
              }
            } catch {
              // ignore
            }
          }
          setItinerary(incoming);
          notify.success('Itinerary Generated', 'Continuous Sovereign Travel plan is ready for review.', {
            actionLink: '/vault',
            actionLabel: 'View Itinerary',
          });
        }
        break;
      case 'FEEDBACK_PROCESSED':
        addLog(`> [MODEL] PREFERENCE WEIGHTS UPDATED FROM FEEDBACK.`);
        notify.info('Preferences Updated', 'Preference weights calibrated from feedback.', {
          actionLink: '/model',
          actionLabel: 'View Model',
        });
        break;
      case 'ERROR':
        setStatus('error');
        addLog(`> [CRITICAL ERROR] ${payload.status}`);
        notify.error('Engine Fault', `Execution error encountered: ${payload.status || 'Inference error'}`);
        break;
      case 'MAP_INGESTION':
        addLog(`> [MAP] ${payload.message || payload.status}`);
        break;
      case 'TRANSIT_DOWNLOAD_STARTED': {
        const cityName = payload.city_name || payload.city || 'City';
        addLog(`> [TRANSIT] Downloading official GTFS schedule for ${cityName}...`);
        notify.info(
          'GTFS Download Started',
          `Downloading official GTFS public transit data for ${cityName} in the background...`,
          {
            actionLink: '/config',
            actionLabel: 'View Status',
          }
        );
        break;
      }
      case 'TRANSIT_TILES_READY': {
        const cityName = payload.city_name || payload.city || 'City';
        addLog(`> [TRANSIT] Real transit data compiled and verified for ${cityName}.`);
        notify.info(
          'Real Transit Available',
          `Official public transit network for ${cityName} is now ready to upgrade.`,
          {
            actionLink: payload.trip_id ? `/vault/${payload.trip_id}` : '/engine',
            actionLabel: 'View Trip',
          }
        );
        break;
      }
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
    const token = typeof window !== 'undefined' ? localStorage.getItem('paladio_token') : null;
    const authQuery = token ? `?token=${encodeURIComponent(token)}` : '';
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || `${protocol}//${host}:${port}/api/v1/ws/stream${authQuery}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      setStatus(prev => prev === 'awaiting_input' ? 'awaiting_input' : 'connected');
      addLog('> [NETWORK] UPLINK ESTABLISHED WITH PALADIO GATEWAY.');
      
      ws.send(JSON.stringify({
        action: 'attach',
        thread_id: threadIdRef.current
      }));
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      try {
        const payload: PaladioEvent = JSON.parse(event.data);
        handleEvent(payload);
      } catch {
        addLog(`> [ERROR] FAILED TO PARSE INCOMING TELEMETRY.`);
      }
    };

    ws.onclose = (event) => {
      if (wsRef.current !== ws) return;
      setStatus(prev => prev === 'awaiting_input' ? 'awaiting_input' : 'disconnected');
      if (event.code !== 1000) {
        addLog(`> [NETWORK] UPLINK LOST. (CODE: ${event.code})`);
      }
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setStatus('error');
      addLog('> [ERROR] WEBSOCKET CONNECTION FAILED.');
    };
  }, [addLog, handleEvent]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      const socket = wsRef.current;
      wsRef.current = null;
      socket.close(1000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const sendMessage = useCallback((message: string, payloadExtras?: Record<string, unknown>) => {
    addLog(`> [USER] ${message}`);

    const sendPayload = (ws: WebSocket) => {
      const payload = {
        action: 'chat',
        message,
        thread_id: threadIdRef.current,
        ...(payloadExtras || {})
      };
      ws.send(JSON.stringify(payload));
    };

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      sendPayload(wsRef.current);
    } else if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
      const socket = wsRef.current;
      socket.addEventListener('open', () => {
        sendPayload(socket);
      }, { once: true });
    } else {
      addLog('> [ERROR] CANNOT SEND. UPLINK OFFLINE.');
    }
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
      answers: data,
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
