import { AuthTokenResponse, CreateUserData, SetupStatusResponse, UpdateProfileData, UpdateUserData, User } from '@/types/auth';

export const getApiBaseUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const host = window.location.hostname;
    return `${protocol}//${host}:8000/api`;
  }
  return 'http://localhost:8000/api';
};

export const getWsBaseUrl = (): string => {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL.replace(/\/api\/ws\/.*$/, '');
  }
  if (process.env.NEXT_PUBLIC_WS_HOST) {
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${process.env.NEXT_PUBLIC_WS_HOST}`;
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = process.env.NEXT_PUBLIC_WS_PORT || '8000';
    return `${protocol}//${host}:${port}`;
  }
  return 'ws://localhost:8000';
};

export const resolveApiMediaUrl = (url: string): string => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const base = getApiBaseUrl().replace(/\/api\/?$/, '');
  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  return `${base}${cleanPath}`;
};

const TOKEN_KEY = 'paladio_token';

export const getAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
};

export const setAuthToken = (token: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
};

export const removeAuthToken = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
};

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const token = getAuthToken();

  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorDetail = `Request failed with status ${res.status}`;
    try {
      const errorJson = await res.json();
      if (errorJson.detail) {
        errorDetail = typeof errorJson.detail === 'string' ? errorJson.detail : JSON.stringify(errorJson.detail);
      }
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

// API methods
export const fetchSetupStatus = (): Promise<SetupStatusResponse> => {
  return apiFetch<SetupStatusResponse>('/auth/setup-status');
};

export const setupMasterAdmin = (data: { email: string; username: string; password: string }): Promise<AuthTokenResponse> => {
  return apiFetch<AuthTokenResponse>('/auth/setup', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const loginApi = (data: { username_or_email: string; password: string }): Promise<AuthTokenResponse> => {
  return apiFetch<AuthTokenResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const fetchCurrentUser = (): Promise<User> => {
  return apiFetch<User>('/users/me');
};

export const listUsersApi = (): Promise<User[]> => {
  return apiFetch<User[]>('/users/');
};

export const createUserApi = (data: CreateUserData): Promise<User> => {
  return apiFetch<User>('/users/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const updateUserApi = (userId: string, data: UpdateUserData): Promise<User> => {
  return apiFetch<User>(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

export const updateProfileApi = (data: UpdateProfileData): Promise<User> => {
  return apiFetch<User>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

export const deleteUserApi = (userId: string): Promise<{ status: string; id: string }> => {
  return apiFetch<{ status: string; id: string }>(`/users/${userId}`, {
    method: 'DELETE',
  });
};

export const updatePreferencesApi = (preferences: Record<string, unknown>): Promise<User> => {
  return apiFetch<User>('/users/me/preferences', {
    method: 'PUT',
    body: JSON.stringify({ preferences }),
  });
};

export const fetchUserEmbeddingApi = (): Promise<{
  user_id: string;
  embedding: number[];
  dimension: number;
}> => {
  return apiFetch<{ user_id: string; embedding: number[]; dimension: number }>('/users/me/embedding');
};

export interface CityGtfsItem {
  city: string;
  display_name: string;
  status: string;
  osm_status: string;
  gtfs_status: string;
  is_ready: boolean;
  is_building: boolean;
  is_queued?: boolean;
  is_downloaded: boolean;
  is_compiled: boolean;
  has_feed: boolean;
  feed_url?: string | null;
  valid_until?: string | null;
  gtfs_feed_name?: string | null;
  updated_at?: string | null;
}

export interface GtfsRegistryResponse {
  has_active_process: boolean;
  active_processes_count: number;
  active_cities: string[];
  total_cities: number;
  compiled_cities: number;
  queued_cities?: number;
  cities: CityGtfsItem[];
}

export const fetchGtfsRegistryApi = (): Promise<GtfsRegistryResponse> => {
  return apiFetch<GtfsRegistryResponse>('/trips/transit/registry');
};

export const triggerGtfsCompileApi = (city: string): Promise<{ status: string; city: string; message: string }> => {
  return apiFetch<{ status: string; city: string; message: string }>('/trips/transit/compile', {
    method: 'POST',
    body: JSON.stringify({ city }),
  });
};

export const deleteGtfsApi = (city: string): Promise<{ status: string; city: string; message: string }> => {
  return apiFetch<{ status: string; city: string; message: string }>(`/trips/transit/${encodeURIComponent(city)}`, {
    method: 'DELETE',
  });
};

export interface PlannedTripTransitItem {
  trip_id: string;
  destination: string;
  city_clean: string;
  start_date: string;
  end_date: string;
  gtfs_status: string;
  is_downloaded: boolean;
  is_building: boolean;
  is_queued: boolean;
}

export interface SyncPlannedGtfsResponse {
  triggered: string[];
  queued: string[];
  already_ready: string[];
  message: string;
}

export const fetchPlannedTripsTransitStatusApi = (): Promise<PlannedTripTransitItem[]> => {
  return apiFetch<PlannedTripTransitItem[]>('/trips/transit/planned-status');
};

export const syncPlannedGtfsApi = (cities: string[]): Promise<SyncPlannedGtfsResponse> => {
  return apiFetch<SyncPlannedGtfsResponse>('/trips/transit/sync-planned', {
    method: 'POST',
    body: JSON.stringify({ cities }),
  });
};

export interface SystemUpdateStatus {
  auto_update_enabled: boolean;
  check_interval_hours: number;
  github_repo: string;
  last_checked_at: string | null;
  current_version: string;
  latest_version: string;
  update_available: boolean;
  release_title: string | null;
  release_notes: string | null;
  release_url: string | null;
  download_url: string | null;
  download_status: 'idle' | 'checking' | 'downloading' | 'downloaded' | 'failed';
  downloaded_file: string | null;
  downloaded_at: string | null;
  file_sha256: string | null;
  file_size_bytes: number | null;
  last_error: string | null;
}

export interface UpdateConfigPayload {
  auto_update_enabled?: boolean;
  check_interval_hours?: number;
  github_repo?: string;
}

export const fetchUpdateStatusApi = (): Promise<SystemUpdateStatus> => {
  return apiFetch<SystemUpdateStatus>('/system/update/status');
};

export const updateAutoUpdateConfigApi = (
  data: UpdateConfigPayload
): Promise<{ status: string; config: SystemUpdateStatus }> => {
  return apiFetch<{ status: string; config: SystemUpdateStatus }>('/system/update/config', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const triggerUpdateCheckApi = (
  forceDownload: boolean = false
): Promise<{ status: string; telemetry: SystemUpdateStatus }> => {
  return apiFetch<{ status: string; telemetry: SystemUpdateStatus }>(
    `/system/update/check?force_download=${forceDownload}`,
    {
      method: 'POST',
    }
  );
};

export const triggerUpdateDownloadApi = (
  version?: string,
  downloadUrl?: string
): Promise<{ status: string; download: SystemUpdateStatus }> => {
  return apiFetch<{ status: string; download: SystemUpdateStatus }>('/system/update/download', {
    method: 'POST',
    body: JSON.stringify({ version, download_url: downloadUrl }),
  });
};

export interface SupportedProviderMeta {
  name: string;
  default_base_url: string | null;
  requires_key: boolean;
  recommended_models: string[];
  default_model: string;
}

export interface ConfiguredProviderInfo {
  provider: string;
  name: string;
  is_active: boolean;
  active_model: string;
  available_models: string[];
  masked_key: string | null;
  requires_key: boolean;
}

export interface LLMConfigResponse {
  provider: string;
  model: string;
  base_url: string | null;
  has_api_key: boolean;
  masked_api_key: string | null;
  supported_providers: Record<string, SupportedProviderMeta>;
  configured_providers?: Record<string, ConfiguredProviderInfo>;
}

export interface UpdateLLMConfigPayload {
  provider: string;
  model: string;
  api_key?: string | null;
  base_url?: string | null;
}

export interface TestLLMConnectionPayload {
  provider: string;
  model: string;
  api_key?: string | null;
  base_url?: string | null;
}

export interface TestLLMConnectionResponse {
  success: boolean;
  latency_ms?: number;
  response?: string;
  error?: string;
  provider: string;
  model: string;
}

export const fetchLlmConfigApi = (): Promise<LLMConfigResponse> => {
  return apiFetch<LLMConfigResponse>('/system/llm/config');
};

export const updateLlmConfigApi = (
  data: UpdateLLMConfigPayload
): Promise<{ status: string; config: LLMConfigResponse }> => {
  return apiFetch<{ status: string; config: LLMConfigResponse }>('/system/llm/config', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const testLlmConfigApi = (
  data: TestLLMConnectionPayload
): Promise<TestLLMConnectionResponse> => {
  return apiFetch<TestLLMConnectionResponse>('/system/llm/test', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export interface EngineConfigData {
  default_max_walking_km: number;
  pacing_tempo: 'leisurely' | 'balanced' | 'intense';
  meal_windows: {
    breakfast: number;
    lunch: number;
    dinner: number;
  };
  attraction_burnout_limit: number;
  deal_scraper_cadence_hours: number;
  price_alert_threshold_pct: number;
}

export interface SwarmConfigData {
  critic_strictness: number;
  thinking_token_budget: number;
  auto_ticket_ingestion: boolean;
  require_human_approval_on_repair: boolean;
}

export interface VaultConfigData {
  auto_snapshot_enabled: boolean;
  snapshot_retention_days: number;
  export_anonymized_trips: boolean;
  // Photo Sync: Immich
  immich_enabled: boolean;
  immich_url: string;
  immich_api_key: string;
  immich_album_name: string;
  // Photo Sync: Synology
  synology_enabled: boolean;
  synology_url: string;
  synology_username: string;
  synology_password: string;
  synology_destination_path: string;
  sync_on_upload: boolean;
}

export interface PushifyConfigData {
  enabled: boolean;
  endpoint_url: string;
  api_key: string;
  channel: string;
}

export interface PushoverConfigData {
  enabled: boolean;
  user_key: string;
  app_token: string;
  priority: number;
}

export interface NtfyConfigData {
  enabled: boolean;
  server_url: string;
  topic: string;
  auth_token: string;
}

export interface WebhookConfigData {
  enabled: boolean;
  url: string;
  secret_header: string;
}

export interface NotificationsConfigData {
  pushify: PushifyConfigData;
  pushover: PushoverConfigData;
  ntfy: NtfyConfigData;
  webhook: WebhookConfigData;
  notify_on_deal_alert: boolean;
  notify_on_trip_update: boolean;
  notify_on_ticket_parse: boolean;
  notify_on_photo_sync: boolean;
}

export interface DomainSettingsResponse<T = unknown> {
  status: string;
  domain: string;
  config: T;
}

export type SupportedSettingsDomain = 'engine' | 'swarm' | 'vault' | 'notifications';

export const fetchDomainSettingsApi = <T = unknown>(
  domain: SupportedSettingsDomain
): Promise<DomainSettingsResponse<T>> => {
  return apiFetch<DomainSettingsResponse<T>>(`/system/settings/${domain}`);
};

export const updateDomainSettingsApi = <T = unknown>(
  domain: SupportedSettingsDomain,
  data: Partial<T>
): Promise<DomainSettingsResponse<T>> => {
  return apiFetch<DomainSettingsResponse<T>>(`/system/settings/${domain}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
};


export interface PhotoSyncTestPayload {
  provider: 'immich' | 'synology';
  url: string;
  api_key?: string;
  username?: string;
  password?: string;
  destination_path?: string;
}

export interface DiagnosticsResponse {
  success: boolean;
  message?: string;
  error?: string;
  details?: unknown;
}

export const testPhotoSyncApi = (
  payload: PhotoSyncTestPayload
): Promise<DiagnosticsResponse> => {
  return apiFetch<DiagnosticsResponse>('/system/photo-sync/test', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const syncAllVaultPhotosApi = (payload?: {
  trip_id?: string;
}): Promise<{
  success: boolean;
  total_scanned: number;
  synced_immich: number;
  synced_synology: number;
  failures: number;
  error?: string;
}> => {
  return apiFetch('/system/photo-sync/sync-all', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
};

export const testNotificationRelayApi = (payload: {
  provider: 'pushify' | 'pushover' | 'ntfy' | 'webhook';
  config: Record<string, unknown>;
}): Promise<DiagnosticsResponse> => {
  return apiFetch<DiagnosticsResponse>('/system/notifications/test', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};





