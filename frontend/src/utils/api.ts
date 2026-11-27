import { AuthTokenResponse, CreateUserData, SetupStatusResponse, UpdateProfileData, UpdateUserData, User } from '@/types/auth';

declare global {
  interface Window {
    __PALADIO_RUNTIME_CONFIG__?: {
      apiPort?: string;
      apiUrl?: string;
    };
  }
}

export const getApiBaseUrl = (): string => {
  return '/api';
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
    const runtimeUrl = window.__PALADIO_RUNTIME_CONFIG__?.apiUrl?.trim();
    if (runtimeUrl) {
      return runtimeUrl
        .replace(/\/+$/, '')
        .replace(/\/api$/, '')
        .replace(/^http:\/\//i, 'ws://')
        .replace(/^https:\/\//i, 'wss://');
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = window.__PALADIO_RUNTIME_CONFIG__?.apiPort || process.env.NEXT_PUBLIC_WS_PORT || '8000';
    return `${protocol}//${host}:${port}`;
  }
  const serverPort = process.env.API_PORT || '8000';
  return `ws://localhost:${serverPort}`;
};

const SAFE_DATA_IMAGE_RE = /^data:image\/(png|jpeg|jpg|webp|gif|avif);base64,([A-Za-z0-9+/=]+)$/i;

const SAFE_IMAGE_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

export const sanitizeHttpImageUrl = (raw: string | null | undefined): string => {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed, 'https://paladio.invalid');
    let candidate = '';
    if (trimmed.startsWith('/')) {
      candidate = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } else if (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'blob:'
    ) {
      candidate = parsed.href;
    } else {
      return '';
    }
    const sanitizedChars = candidate.replace(
      /[<>"'`\\]/g,
      (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    try {
      return encodeURI(decodeURI(sanitizedChars));
    } catch {
      return encodeURI(sanitizedChars);
    }
  } catch {
    return '';
  }
};

export const dataImageToObjectUrl = (raw: string | null | undefined): string | null => {
  if (typeof window === 'undefined' || !raw || typeof raw !== 'string') return null;
  const match = SAFE_DATA_IMAGE_RE.exec(raw.trim());
  if (!match) return null;
  const mime = SAFE_IMAGE_MIME_TYPES[match[1].toLowerCase()];
  if (!mime) return null;
  try {
    const binary = window.atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch {
    return null;
  }
};

export const sanitizeImageUrl = (raw: string | null | undefined): string => {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const dataMatch = SAFE_DATA_IMAGE_RE.exec(trimmed);
  if (dataMatch) {
    const mime = SAFE_IMAGE_MIME_TYPES[dataMatch[1].toLowerCase()];
    if (!mime) return '';
    return `data:${mime};base64,${dataMatch[2]}`;
  }
  return sanitizeHttpImageUrl(trimmed);
};

export const resolveApiMediaUrl = (url: string): string => {
  if (!url) return '';
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  ) {
    return sanitizeImageUrl(url);
  }
  const base = getApiBaseUrl().replace(/\/api\/?$/, '');
  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  return sanitizeImageUrl(`${base}${cleanPath}`);
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

  const timeoutMs = 15000;
  const controller = options.signal ? null : new AbortController();
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers,
      signal: options.signal ?? controller?.signal,
    });
  } catch (err) {
    if (controller?.signal.aborted && !options.signal?.aborted) {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw err;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }

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

/**
 * Checks if an error is caused by the backend server being offline, rebooting, or unreachable.
 */
export function isNetworkOrServerDownError(err: unknown): boolean {
  if (!err) return false;
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  return (
    lower.includes('networkerror') ||
    lower.includes('failed to fetch') ||
    lower.includes('load failed') ||
    lower.includes('network request failed') ||
    lower.includes('fetch failed') ||
    lower.includes('econnrefused') ||
    lower.includes('connection refused') ||
    lower.includes('status 502') ||
    lower.includes('status 503') ||
    lower.includes('status 504')
  );
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
  country_code?: string | null;
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
  poi_count?: number;
  poi_db_bytes?: number;
  transit_stations_count?: number;
  transit_lines_count?: number;
  transit_db_bytes?: number;
  hotel_count?: number;
  hotel_db_bytes?: number;
  disk_gtfs_bytes?: number;
  disk_osm_bytes?: number;
  total_disk_bytes?: number;
  total_db_bytes?: number;
  total_storage_bytes?: number;
}

export interface GtfsRegistryResponse {
  has_active_process: boolean;
  active_processes_count: number;
  active_cities: string[];
  total_cities: number;
  compiled_cities: number;
  queued_cities?: number;
  total_disk_bytes?: number;
  total_db_bytes?: number;
  total_storage_bytes?: number;
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

export const deleteCityPoisApi = (city: string): Promise<{ status: string; city: string; deleted_pois: number; message: string }> => {
  return apiFetch<{ status: string; city: string; deleted_pois: number; message: string }>(`/trips/pois/${encodeURIComponent(city)}`, {
    method: 'DELETE',
  });
};

export const downloadCityPoisApi = (city: string): Promise<{ status: string; city: string; task_id?: string; message: string }> => {
  return apiFetch<{ status: string; city: string; task_id?: string; message: string }>(`/pois/city/${encodeURIComponent(city)}/download`, {
    method: 'POST',
  });
};

export const fetchCityPoisStatusApi = (city: string): Promise<{ city: string; poi_count: number; is_hydrating: boolean }> => {
  return apiFetch<{ city: string; poi_count: number; is_hydrating: boolean }>(`/pois/city/${encodeURIComponent(city)}/status`);
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
  has_saved_key?: boolean;
  base_url?: string | null;
  requires_key: boolean;
}

export interface HardwareProfileData {
  total_ram_gb: number;
  available_ram_gb: number;
  swap_total_gb: number;
  cpu_logical_cores: number;
  cpu_physical_cores: number;
  has_gpu: boolean;
  gpu_name: string | null;
  tier: 'low' | 'medium' | 'high';
  recommended_model: string;
  recommended_num_ctx: number;
  recommended_num_thread: number;
  keep_alive: string;
  memory_warning: string | null;
}

export interface LLMConfigResponse {
  provider: string;
  model: string;
  base_url: string | null;
  has_api_key: boolean;
  masked_api_key: string | null;
  supported_providers: Record<string, SupportedProviderMeta>;
  configured_providers?: Record<string, ConfiguredProviderInfo>;
  hardware_profile?: HardwareProfileData;
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

export interface ListLLMModelsPayload {
  provider: string;
  api_key?: string | null;
  base_url?: string | null;
}

export interface ListLLMModelsResponse {
  success: boolean;
  provider: string;
  models: string[];
  source?: string;
  error?: string;
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

export const fetchProviderModelsApi = (
  data: ListLLMModelsPayload
): Promise<ListLLMModelsResponse> => {
  return apiFetch<ListLLMModelsResponse>('/system/llm/models', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const deleteLlmProviderApi = (
  provider: string
): Promise<{ status: string; config: LLMConfigResponse }> => {
  return apiFetch<{ status: string; config: LLMConfigResponse }>(
    `/system/llm/provider/${encodeURIComponent(provider)}`,
    {
      method: 'DELETE',
    }
  );
};

export const unloadLlmModelApi = (
  model?: string
): Promise<{ success: boolean; message: string; hardware_profile?: HardwareProfileData }> => {
  return apiFetch<{ success: boolean; message: string; hardware_profile?: HardwareProfileData }>('/system/llm/unload', {
    method: 'POST',
    body: JSON.stringify({ model: model || null }),
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

// ---------------------------------------------------------------------------
// External API Keys & Secrets API
// ---------------------------------------------------------------------------

export interface SecretItemResponse {
  provider: string;
  label: string;
  description: string;
  configured: boolean;
  masked_token: string | null;
  source: 'database' | 'env' | 'not_configured';
  updated_at?: string | null;
}

export interface SecretsStatusResponse {
  status: string;
  secrets: {
    aviasales: SecretItemResponse;
    [key: string]: SecretItemResponse;
  };
}

export const fetchSecretsStatusApi = (): Promise<SecretsStatusResponse> => {
  return apiFetch<SecretsStatusResponse>('/system/secrets');
};

export const updateSecretApi = (
  secretType: string,
  token: string
): Promise<{ status: string; secret: SecretItemResponse }> => {
  return apiFetch<{ status: string; secret: SecretItemResponse }>('/system/secrets', {
    method: 'POST',
    body: JSON.stringify({ secret_type: secretType, token }),
  });
};

export const deleteSecretApi = (
  secretType: string
): Promise<{ status: string; secret: SecretItemResponse }> => {
  return apiFetch<{ status: string; secret: SecretItemResponse }>(`/system/secrets/${secretType}`, {
    method: 'DELETE',
  });
};

export const testSecretApi = (
  secretType: string,
  token?: string
): Promise<{ success: boolean; message: string }> => {
  return apiFetch<{ success: boolean; message: string }>(`/system/secrets/test/${secretType}`, {
    method: 'POST',
    body: JSON.stringify({ token: token || null }),
  });
};

// ---------------------------------------------------------------------------
// Taste Profile, Deal Sweep & Vault Operations API
// ---------------------------------------------------------------------------

export interface TasteAffinityItem {
  category: string;
  score: number;
}

export interface TasteProfileResponse {
  status: string;
  active: boolean;
  dimensions: number;
  affinities: TasteAffinityItem[];
}

export const fetchTasteProfileApi = (): Promise<TasteProfileResponse> => {
  return apiFetch<TasteProfileResponse>('/system/taste-profile');
};

export const resetTasteProfileApi = (): Promise<TasteProfileResponse> => {
  return apiFetch<TasteProfileResponse>('/system/taste-profile/reset', {
    method: 'POST',
  });
};

export const triggerDealSweepApi = (): Promise<{
  status: string;
  message: string;
  triggered_at: string;
}> => {
  return apiFetch('/system/deals/sweep', {
    method: 'POST',
  });
};

export const createVaultSnapshotApi = (): Promise<{
  status: string;
  snapshot_at: string;
  domains_archived: string[];
}> => {
  return apiFetch('/system/vault/snapshot', {
    method: 'POST',
  });
};

export const purgeSystemCacheApi = (): Promise<{
  status: string;
  purged: boolean;
  keys_cleared: number;
}> => {
  return apiFetch('/system/cache/purge', {
    method: 'POST',
  });
};

// ---------------------------------------------------------------------------
// Background Trip Generation Jobs API
// ---------------------------------------------------------------------------

export type TripGenerationJobStatus =
  | 'running'
  | 'awaiting_input'
  | 'completed'
  | 'aborted'
  | 'failed'
  | 'cancelled';

export interface TripGenerationOverlapInfo {
  id?: string;
  destination?: string;
  start_date?: string;
  end_date?: string;
}

export interface TripGenerationInterruptPayload {
  type?: string;
  message?: string;
  warning_title?: string;
  overlapping_trip?: TripGenerationOverlapInfo;
  fields?: string[];
  constraints?: Record<string, unknown>;
  booking_anchors?: Record<string, unknown>;
  variant?: string;
}

export interface TripGenerationJob {
  id: string;
  user_id?: string | null;
  thread_id: string;
  destination: string;
  title?: string | null;
  status: TripGenerationJobStatus;
  stage: string;
  stage_message?: string | null;
  prompt: string;
  interrupt_type?: string | null;
  interrupt_payload?: TripGenerationInterruptPayload | null;
  guardrail_errors?: string[] | null;
  error_message?: string | null;
  trip_id?: string | null;
  acknowledged: boolean;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  kind?: 'personalized' | 'blank';
}

export const startTripGenerationApi = (
  payload: Record<string, unknown>
): Promise<TripGenerationJob> => {
  return apiFetch<TripGenerationJob>('/trips/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const listTripGenerationJobsApi = (): Promise<TripGenerationJob[]> => {
  return apiFetch<TripGenerationJob[]>('/trips/generation-jobs');
};

export const getTripGenerationJobApi = (jobId: string): Promise<TripGenerationJob> => {
  return apiFetch<TripGenerationJob>(`/trips/generation-jobs/${encodeURIComponent(jobId)}`);
};

export const resumeTripGenerationJobApi = (
  jobId: string,
  payload: Record<string, unknown>
): Promise<TripGenerationJob> => {
  return apiFetch<TripGenerationJob>(`/trips/generation-jobs/${encodeURIComponent(jobId)}/resume`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const cancelTripGenerationJobApi = (jobId: string): Promise<TripGenerationJob> => {
  return apiFetch<TripGenerationJob>(`/trips/generation-jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  });
};

export const acknowledgeTripGenerationJobApi = (jobId: string): Promise<void> => {
  return apiFetch<void>(`/trips/generation-jobs/${encodeURIComponent(jobId)}/acknowledge`, {
    method: 'POST',
  });
};







