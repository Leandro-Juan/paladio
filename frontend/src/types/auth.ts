export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  email?: string | null;
  username: string;
  role: UserRole;
  is_active: boolean;
  preferences?: Record<string, unknown>;
  has_embedding?: boolean;
  created_at?: string | null;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface SetupStatusResponse {
  setup_required: boolean;
  user_count: number;
}

export interface CreateUserData {
  email?: string;
  username: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserData {
  username?: string;
  email?: string | null;
  role?: UserRole;
  is_active?: boolean;
  password?: string;
  avatar_url?: string;
  preferences?: Record<string, unknown>;
}

export interface UpdateProfileData {
  username?: string;
  email?: string | null;
  password?: string;
  avatar_url?: string;
  preferences?: Record<string, unknown>;
}
