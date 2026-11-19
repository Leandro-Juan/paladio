"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  AgentChatMessage,
  AgentClientMessage,
  AgentServerEvent,
  ProposalItem,
  ToolCallItem,
  WorkspaceContextData,
} from './types/agent';
import { parseAgentError } from './errorParser';
import { translate } from '@/stores/localeStore';
import { notify } from '@/utils/notify';
import { getAuthToken, getWsBaseUrl } from '@/utils/api';

interface UseTripAgentProps {
  tripId: string;
  uiContext?: WorkspaceContextData;
  onTripUpdated?: () => void;
}

export function useTripAgent({ tripId, uiContext, onTripUpdated }: UseTripAgentProps) {
  // Initialize session message history from sessionStorage safely without synchronous setState in effect
  const [messages, setMessages] = useState<AgentChatMessage[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = sessionStorage.getItem(`paladio_agent_chat_${tripId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.map((m: AgentChatMessage) => ({
            ...m,
            // Ensure restored messages are not stuck in an active streaming state
            isStreaming: false,
            content: m.content || (m.role === 'assistant' ? translate('trip_agent.no_response_recorded') : ''),
          }));
        }
      }
    } catch {
      // Ignore sessionStorage errors
    }
    return [];
  });

  const [isWorking, setIsWorking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [lastChange, setLastChange] = useState<{ revision: number; summary: string; undoToken?: string } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isUnmountedRef = useRef(false);
  const connectWsRef = useRef<() => void>(() => {});

  // Persist messages to sessionStorage
  useEffect(() => {
    if (messages.length > 0) {
      try {
        sessionStorage.setItem(`paladio_agent_chat_${tripId}`, JSON.stringify(messages.slice(-20)));
      } catch {
        // Ignore
      }
    }
  }, [messages, tripId]);

  // Handle incoming server event
  const handleServerEvent = useCallback(
    (ev: AgentServerEvent) => {
      switch (ev.event) {
        case 'turn_started': {
          setIsWorking(true);
          // Add empty streaming assistant bubble (thinking indicator will display until first token)
          setMessages((prev) => [
            ...prev,
            {
              id: ev.turn_id || `turn_${Date.now()}`,
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              isStreaming: true,
              toolCalls: [],
            },
          ]);
          break;
        }

        case 'token': {
          if (!ev.token) return;
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const targetIdx = ev.turn_id
              ? prev.findLastIndex((m) => m.id === ev.turn_id)
              : prev.findLastIndex((m) => m.role === 'assistant');
            if (targetIdx === -1) return prev;

            const target = prev[targetIdx];
            const updated = { ...target, content: (target.content || '') + ev.token };
            const next = [...prev];
            next[targetIdx] = updated;
            return next;
          });
          break;
        }

        case 'tool_call': {
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const targetIdx = ev.turn_id
              ? prev.findLastIndex((m) => m.id === ev.turn_id)
              : prev.findLastIndex((m) => m.role === 'assistant');
            if (targetIdx === -1) return prev;

            const target = prev[targetIdx];
            const newToolCall: ToolCallItem = {
              call_id: ev.call_id || `call_${Date.now()}`,
              tool: ev.tool || 'unknown_tool',
              args: ev.args,
              status: 'running',
            };
            const updated = {
              ...target,
              toolCalls: [...(target.toolCalls || []), newToolCall],
            };
            const next = [...prev];
            next[targetIdx] = updated;
            return next;
          });
          break;
        }

        case 'tool_result': {
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const targetIdx = ev.turn_id
              ? prev.findLastIndex((m) => m.id === ev.turn_id)
              : prev.findLastIndex((m) => m.role === 'assistant');
            if (targetIdx === -1) return prev;

            const target = prev[targetIdx];
            let matched = false;
            const toolCalls = (target.toolCalls || []).map((tc) => {
              const isMatch = ev.call_id
                ? tc.call_id === ev.call_id
                : (!matched && tc.tool === ev.tool && tc.status === 'running') || (!matched && tc.tool === ev.tool);
              if (isMatch) {
                matched = true;
                return {
                  ...tc,
                  status: (ev.ok ? 'done' : 'error') as 'done' | 'error',
                  summary: ev.summary,
                  change_set: ev.change_set,
                  data: ev.data,
                  error: ev.message,
                };
              }
              return tc;
            });
            const next = [...prev];
            next[targetIdx] = { ...target, toolCalls };
            return next;
          });
          break;
        }

        case 'proposal': {
          if (!ev.proposal_id) return;
          const proposalItem: ProposalItem = {
            proposal_id: ev.proposal_id,
            tool: ev.tool || 'action',
            summary: ev.summary || translate('trip_agent.proposal_default_summary'),
            diff: ev.diff,
            expires_in_seconds: ev.expires_in_seconds || 600,
            created_at: Date.now(),
          };
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const targetIdx = ev.turn_id
              ? prev.findLastIndex((m) => m.id === ev.turn_id)
              : prev.findLastIndex((m) => m.role === 'assistant');
            if (targetIdx === -1) return prev;

            const target = prev[targetIdx];
            const next = [...prev];
            next[targetIdx] = { ...target, proposal: proposalItem };
            return next;
          });
          break;
        }

        case 'trip_updated': {
          if (ev.revision !== undefined && ev.revision !== null) {
            setLastChange({
              revision: ev.revision,
              summary: ev.summary || translate('trip_agent.trip_itinerary_updated'),
              undoToken: ev.undo_token,
            });
          }
          onTripUpdated?.();
          break;
        }

        case 'turn_done': {
          setIsWorking(false);
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const targetIdx = ev.turn_id
              ? prev.findLastIndex((m) => m.id === ev.turn_id)
              : prev.findLastIndex((m) => m.role === 'assistant');

            return prev.map((m, idx) => {
              if (idx === targetIdx || (!ev.turn_id && idx === prev.length - 1 && m.role === 'assistant')) {
                return {
                  ...m,
                  content: ev.final_text || m.content,
                  isStreaming: false,
                };
              }
              if (m.isStreaming) {
                return { ...m, isStreaming: false };
              }
              return m;
            });
          });
          break;
        }

        case 'warning': {
          if (ev.code === 'CANCELLED' || ev.code === 'TURN_IN_PROGRESS') {
            setIsWorking(false);
          }
          notify.info(translate('trip_agent.trip_agent'), ev.message || translate('trip_agent.warning_default'));
          break;
        }

        case 'error': {
          setIsWorking(false);
          const parsedError = parseAgentError(ev.message, ev.code);
          notify.error(parsedError.title, parsedError.description);
          setMessages((prev) => {
            if (prev.length === 0) {
              return [
                {
                  id: ev.turn_id || `err_${Date.now()}`,
                  role: 'assistant',
                  content: '',
                  timestamp: Date.now(),
                  error: parsedError,
                  isStreaming: false,
                },
              ];
            }
            const targetIdx = ev.turn_id
              ? prev.findLastIndex((m) => m.id === ev.turn_id)
              : prev.findLastIndex((m) => m.role === 'assistant');

            return prev.map((m, idx) => {
              if (idx === targetIdx || (idx === prev.length - 1 && m.role === 'assistant')) {
                return {
                  ...m,
                  error: parsedError,
                  isStreaming: false,
                };
              }
              if (m.isStreaming) {
                return { ...m, isStreaming: false };
              }
              return m;
            });
          });
          break;
        }
      }
    },
    [onTripUpdated]
  );

  // Connect WebSocket
  const connectWs = useCallback(() => {
    if (!tripId || isUnmountedRef.current) return;

    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const token = getAuthToken();
      if (!token) {
        return;
      }
      const wsBase = getWsBaseUrl();
      const wsUrl = `${wsBase}/api/ws/trip-agent/${tripId}?token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data: AgentServerEvent = JSON.parse(event.data);
          handleServerEvent(data);
        } catch (e) {
          console.error('[TripAgent WS] Failed to parse event', e);
        }
      };

      ws.onerror = (e) => {
        console.warn('[TripAgent WS] Error:', e);
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsWorking(false);

        // Mark any hanging streaming message as interrupted rather than stuck streaming
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (last.role === 'assistant' && last.isStreaming) {
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                content: last.content || translate('trip_agent.connection_interrupted_reconnecting'),
                isStreaming: false,
              },
            ];
          }
          return prev;
        });

        // Exponential backoff reconnect
        if (!isUnmountedRef.current) {
          const timeout = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 10000);
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWsRef.current();
          }, timeout);
        }
      };
    } catch (e) {
      console.error('[TripAgent WS] Connection attempt error', e);
    }
  }, [tripId, handleServerEvent]);

  // Keep ref up to date for reconnect timeouts
  useEffect(() => {
    connectWsRef.current = connectWs;
  }, [connectWs]);

  useEffect(() => {
    isUnmountedRef.current = false;
    connectWs();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connectWs]);

  // Send message
  const sendMessage = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;

      // Optimistic user message
      setMessages((prev) => [
        ...prev,
        {
          id: `usr_${Date.now()}`,
          role: 'user',
          content: clean,
          timestamp: Date.now(),
        },
      ]);
      setIsWorking(true);

      const payload: AgentClientMessage = {
        type: 'user_message',
        message: clean,
        ui_context: uiContext,
      };

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(payload));
      } else {
        setIsWorking(false);
        notify.warning(translate('trip_agent.agent_offline_title'), translate('trip_agent.reconnecting_copilot'));
        connectWs();
      }
    },
    [uiContext, connectWs]
  );

  // Approve proposal
  const approveProposal = useCallback((proposalId: string) => {
    const payload: AgentClientMessage = {
      type: 'approve',
      proposal_id: proposalId,
    };
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  // Reject proposal
  const rejectProposal = useCallback((proposalId: string) => {
    const payload: AgentClientMessage = {
      type: 'reject',
      proposal_id: proposalId,
    };
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
    // Remove proposal card from state
    setMessages((prev) =>
      prev.map((msg) =>
        msg.proposal?.proposal_id === proposalId ? { ...msg, proposal: undefined } : msg
      )
    );
  }, []);

  // Cancel active turn
  const cancelTurn = useCallback(() => {
    const payload: AgentClientMessage = { type: 'cancel' };
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
    setIsWorking(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false, content: m.content || translate('trip_agent.turn_cancelled') } : m))
    );
  }, []);

  // Undo
  const undoLastChange = useCallback((revision?: number) => {
    const payload: AgentClientMessage = {
      type: 'undo',
      revision: revision,
    };
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
    setLastChange(null);
  }, []);

  // Clear local history
  const clearHistory = useCallback(() => {
    setMessages([]);
    try {
      sessionStorage.removeItem(`paladio_agent_chat_${tripId}`);
    } catch {
      // Ignore
    }
  }, [tripId]);

  return {
    messages,
    isWorking,
    isConnected,
    lastChange,
    sendMessage,
    approveProposal,
    rejectProposal,
    cancelTurn,
    undoLastChange,
    clearHistory,
  };
}
