import { AuthTokenResponse, CreateUserData, SetupStatusResponse, UpdateUserData, User } from '@/types/auth';

export const getApiBaseUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const host = window.location.hostname;
    return `${protocol}//${host}:8000/api/v1`;
  }
  return 'http://localhost:8000/api/v1';
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
  return apiFetch<User>('/auth/me');
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


