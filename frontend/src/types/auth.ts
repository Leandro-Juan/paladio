export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
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
  email: string;
  username: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserData {
  role?: UserRole;
  is_active?: boolean;
  password?: string;
}
