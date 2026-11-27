"use client";

import React, { createContext, useState, useEffect, useRef, useCallback } from 'react';
import { useOptionalAuth } from '@/contexts/AuthContext';
import { Poi } from '@/types/domain';
import { notify } from '@/utils/notify';
import { getAuthToken, getWsBaseUrl } from '@/utils/api';
import {
  TripGenerationServerEvent,
  useTripGenerationStore,
} from '@/stores/tripGenerationStore';

export type SocketStatus = 'disconnected' | 'connected' | 'error';

export interface PaladioEvent {
  event: string;
  status?: string;
  data?: unknown;
  message?: string;
  city?: string;
  city_name?: string;
  city_id?: string;
  stage?: string;
  raw_count?: number;
  progress?: number;
  trip_id?: string;
  job_id?: string;
  thread_id?: string;
  user_id?: string | null;
  destination?: string;
  title?: string;
  interrupt_type?: string;
  interrupt_payload?: Record<string, unknown>;
  guardrail_errors?: string[];
  error_message?: string;
}

export interface SocketContextProps {
  status: SocketStatus;
  sendFeedback: (poi: Poi, targetScore: number, userId?: string) => void;
  connect: () => void;
  disconnect: () => void;
}

export const SocketContext = createContext<SocketContextProps | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const auth = useOptionalAuth();
  const authUserId = auth?.user?.id ?? null;
  const authToken = auth?.token ?? null;

  const [status, setStatus] = useState<SocketStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const connectRef = useRef<() => void>(() => {});
  const authIdentityRef = useRef<string | null>(null);

  const handleEvent = useCallback((payload: PaladioEvent) => {
    switch (payload.event) {
      case 'TRIP_JOB_STARTED':
      case 'TRIP_JOB_PROGRESS':
      case 'TRIP_JOB_AWAITING_INPUT':
      case 'TRIP_JOB_COMPLETED':
      case 'TRIP_JOB_ABORTED':
      case 'TRIP_JOB_FAILED':
      case 'TRIP_JOB_CANCELLED':
        useTripGenerationStore
          .getState()
          .handleServerEvent(payload as unknown as TripGenerationServerEvent);
        break;
      case 'FEEDBACK_PROCESSED':
        notify.info('Preferences Updated', 'Preference weights calibrated from feedback.', {
          actionLink: '/dashboard',
          actionLabel: 'View Control Center',
        });
        break;
      case 'ERROR':
        notify.error(
          'Engine Fault',
          `Execution error encountered: ${payload.status || 'Inference error'}`
        );
        break;
      case 'TRANSIT_QUEUED': {
        const cityName = payload.city_name || payload.city || 'City';
        notify.info(
          'GTFS Download Queued',
          `Official public transit data download for ${cityName} is queued.`,
          {
            actionLink: '/config',
            actionLabel: 'View Queue',
          }
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('paladio:transit_queued', { detail: payload }));
          window.dispatchEvent(new CustomEvent('paladio:transit_event', { detail: payload }));
        }
        break;
      }
      case 'TRANSIT_DOWNLOAD_STARTED': {
        const cityName = payload.city_name || payload.city || 'City';
        notify.info(
          'GTFS Download Started',
          `Downloading official GTFS public transit data for ${cityName} in the background...`,
          {
            actionLink: '/config',
            actionLabel: 'View Status',
          }
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('paladio:transit_download_started', { detail: payload }));
          window.dispatchEvent(new CustomEvent('paladio:transit_event', { detail: payload }));
        }
        break;
      }
      case 'TRANSIT_DERIVATION_READY': {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('paladio:transit_derivation_ready', { detail: payload }));
          window.dispatchEvent(new CustomEvent('paladio:transit_event', { detail: payload }));
        }
        break;
      }
      case 'TRANSIT_TILES_READY': {
        const cityName = payload.city_name || payload.city || 'City';
        notify.info(
          'Transit Network Ready',
          `Official public transit network for ${cityName} is now ready.`,
          {
            actionLink: payload.trip_id ? `/trips/${payload.trip_id}` : '/engine',
            actionLabel: 'View Trip',
          }
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('paladio:transit_tiles_ready', { detail: payload }));
          window.dispatchEvent(new CustomEvent('paladio:transit_event', { detail: payload }));
        }
        break;
      }
      case 'TRANSIT_COMPILE_FAILED': {
        const cityName = payload.city_name || payload.city || 'City';
        notify.error(
          'GTFS Download Failed',
          `Transit data download for ${cityName} encountered an error.`
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('paladio:transit_compile_failed', { detail: payload }));
          window.dispatchEvent(new CustomEvent('paladio:transit_event', { detail: payload }));
        }
        break;
      }
      case 'TRANSIT_DERIVATION_FAILED': {
        const cityName = payload.city_name || payload.city || 'City';
        notify.error(
          'Transit Derivation Failed',
          `Derivation of transit lines for ${cityName} encountered an error.`
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('paladio:transit_derivation_failed', { detail: payload }));
          window.dispatchEvent(new CustomEvent('paladio:transit_event', { detail: payload }));
        }
        break;
      }
      case 'TRANSIT_UNAVAILABLE': {
        const cityName = payload.city_name || payload.city || 'City';
        notify.info(
          'Transit Feed Unavailable',
          `No public transit GTFS schedule exists for ${cityName}. Point-to-point transit directions remain active via Transitous.`
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('paladio:transit_unavailable', { detail: payload }));
          window.dispatchEvent(new CustomEvent('paladio:transit_event', { detail: payload }));
        }
        break;
      }
      case 'TRANSIT_DELETED': {
        const cityName = payload.city_name || payload.city || 'City';
        notify.info(
          'GTFS Data Removed',
          `Transit schedules and compilation for ${cityName} have been removed and cleaned up.`
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('paladio:transit_deleted', { detail: payload }));
          window.dispatchEvent(new CustomEvent('paladio:transit_event', { detail: payload }));
        }
        break;
      }
      case 'HYDRATION_STARTED': {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('paladio:city_hydration_started', { detail: payload }));
          window.dispatchEvent(new CustomEvent('paladio:city_hydration_event', { detail: payload }));
        }
        break;
      }
      case 'HYDRATION_STAGE_STARTED': {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('paladio:city_hydration_stage_started', { detail: payload }));
          window.dispatchEvent(new CustomEvent('paladio:city_hydration_event', { detail: payload }));
        }
        break;
      }
      case 'HYDRATION_STAGE_COMPLETED': {
        if (payload.stage === 'INGESTING' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('paladio:city_hydration_completed', { detail: payload }));
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('paladio:city_hydration_stage_completed', { detail: payload }));
          window.dispatchEvent(new CustomEvent('paladio:city_hydration_event', { detail: payload }));
        }
        break;
      }
      case 'HYDRATION_COMPLETED': {
        const cityName = payload.city_name || payload.city || 'City';
        notify.success(
          'POI Database Ready',
          `POI database for ${cityName} has finished downloading and indexing.`
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('paladio:city_hydration_completed', { detail: payload }));
          window.dispatchEvent(new CustomEvent('paladio:city_hydration_event', { detail: payload }));
        }
        break;
      }
      case 'HYDRATION_FAILED': {
        const cityName = payload.city_name || payload.city || 'City';
        notify.error(
          'POI Download Failed',
          `Downloading POI database for ${cityName} encountered an error.`
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('paladio:city_hydration_failed', { detail: payload }));
          window.dispatchEvent(new CustomEvent('paladio:city_hydration_event', { detail: payload }));
        }
        break;
      }
      case 'HEARTBEAT':
      case 'PONG':
        break;
      default:
        break;
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    clearReconnectTimer();

    const wsBase = getWsBaseUrl();
    const token = authToken || getAuthToken();
    const authQuery = token ? `?token=${encodeURIComponent(token)}` : '';
    const wsUrl = `${wsBase}/api/ws/stream${authQuery}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      clearReconnectTimer();
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      try {
        const payload: PaladioEvent = JSON.parse(event.data);
        handleEvent(payload);
      } catch {
        // Ignore unparseable frames
      }
    };

    ws.onclose = (event) => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setStatus('disconnected');
      if (event.code !== 1000) {
        clearReconnectTimer();
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connectRef.current();
        }, 2500);
      }
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setStatus('error');
      clearReconnectTimer();
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connectRef.current();
      }, 2500);
    };
  }, [authToken, handleEvent, clearReconnectTimer]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    clearReconnectTimer();
    if (wsRef.current) {
      const socket = wsRef.current;
      wsRef.current = null;
      socket.close(1000);
    }
    setStatus('disconnected');
  }, [clearReconnectTimer]);

  useEffect(() => {
    connect();

    const handleOnline = () => {
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        connect();
      }
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
      disconnect();
    };
  }, [connect, disconnect]);

  // Reconnect WebSocket cleanly when the authenticated user/token transitions (e.g. after login/logout)
  useEffect(() => {
    const nextIdentity = `${authUserId || ''}:${authToken || ''}`;
    if (authIdentityRef.current === null) {
      authIdentityRef.current = nextIdentity;
      return;
    }
    if (authIdentityRef.current !== nextIdentity) {
      authIdentityRef.current = nextIdentity;
      disconnect();
      connect();
    }
  }, [authUserId, authToken, connect, disconnect]);

  const sendFeedback = useCallback(
    (poi: Partial<Poi>, targetScore: number, userId: string = 'default_user') => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return;
      }

      const payload = {
        action: 'feedback',
        poi,
        target_score: targetScore,
        user_id: userId,
      };
      wsRef.current.send(JSON.stringify(payload));
    },
    []
  );

  return (
    <SocketContext.Provider
      value={{
        status,
        sendFeedback,
        connect,
        disconnect,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}
