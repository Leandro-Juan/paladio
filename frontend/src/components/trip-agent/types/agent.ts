export type ServerEventType =
  | 'turn_started'
  | 'token'
  | 'tool_call'
  | 'tool_result'
  | 'proposal'
  | 'trip_updated'
  | 'warning'
  | 'error'
  | 'turn_done';

export type ClientMessageType =
  | 'user_message'
  | 'approve'
  | 'reject'
  | 'cancel'
  | 'undo';

export interface AgentServerEvent {
  event: ServerEventType;
  turn_id?: string;
  timestamp?: number;
  token?: string;
  call_id?: string;
  tool?: string;
  args?: Record<string, any>;
  ok?: boolean;
  summary?: string;
  change_set?: {
    revision?: number;
    undo_token?: string;
    changes?: Array<{ day?: number; stop_id?: string; kind?: string }>;
  };
  data?: any;
  proposal_id?: string;
  diff?: Record<string, any>;
  expires_in_seconds?: number;
  revision?: number;
  undo_token?: string;
  affected_days?: number[];
  changed_stop_ids?: string[];
  message?: string;
  code?: string;
  final_text?: string;
  tools_called?: string[];
}

export interface AgentClientMessage {
  type: ClientMessageType;
  message?: string;
  proposal_id?: string;
  ui_context?: WorkspaceContextData;
  undo_token?: string;
  revision?: number;
}

export interface ToolCallItem {
  call_id: string;
  tool: string;
  args?: Record<string, any>;
  summary?: string;
  status: 'running' | 'done' | 'error';
  change_set?: any;
  data?: any;
  error?: string;
}

export interface ProposalItem {
  proposal_id: string;
  tool: string;
  summary: string;
  diff?: Record<string, any>;
  expires_in_seconds?: number;
  created_at: number;
}

export type AgentErrorCategory =
  | 'access_denied'
  | 'rate_limit'
  | 'auth_failure'
  | 'context_overflow'
  | 'connection_error'
  | 'internal';

export interface AgentErrorInfo {
  category: AgentErrorCategory;
  title: string;
  description: string;
  statusCode?: number;
  modelName?: string;
  code?: string;
  rawMessage?: string;
  suggestedFix?: string;
  canRetry?: boolean;
  canSwitchModel?: boolean;
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallItem[];
  proposal?: ProposalItem;
  isStreaming?: boolean;
  error?: AgentErrorInfo;
}

export interface WorkspaceContextData {
  active_tab?: string;
  selected_day?: number | 'all';
  selected_stop_id?: string;
  destination?: string;
  bounds?: {
    north?: number;
    south?: number;
    east?: number;
    west?: number;
  };
}
