"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@/types/auth';
import {
  fetchCurrentUser,
  fetchSetupStatus,
  getAuthToken,
  loginApi,
  removeAuthToken,
  setAuthToken,
  setupMasterAdmin,
} from '@/utils/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  setupRequired: boolean | null;
  isLoading: boolean;
  login: (usernameOrEmail: string, pass: string) => Promise<void>;
  setupAdmin: (data: { email: string; username: string; password: string }) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let ignore = false;

    async function checkStatus() {
      try {
        const status = await fetchSetupStatus();
        if (ignore) return;
        setSetupRequired(status.setup_required);

        if (!status.setup_required) {
          const storedToken = getAuthToken();
          if (storedToken) {
            try {
              const currentUser = await fetchCurrentUser();
              if (ignore) return;
              setUser(currentUser);
              setTokenState(storedToken);
            } catch (err) {
              console.warn('Stored token invalid or expired. Resetting session.', err);
              if (ignore) return;
              removeAuthToken();
              setUser(null);
              setTokenState(null);
            }
          }
        } else {
          removeAuthToken();
          setUser(null);
          setTokenState(null);
        }
      } catch (err) {
        console.error('Failed to query Paladio setup status', err);
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    checkStatus();
    return () => {
      ignore = true;
    };
  }, []);

  const login = async (usernameOrEmail: string, pass: string) => {
    const res = await loginApi({ username_or_email: usernameOrEmail, password: pass });
    setAuthToken(res.access_token);
    setTokenState(res.access_token);
    setUser(res.user);
    setSetupRequired(false);
  };

  const setupAdmin = async (data: { email: string; username: string; password: string }) => {
    const res = await setupMasterAdmin(data);
    setAuthToken(res.access_token);
    setTokenState(res.access_token);
    setUser(res.user);
    setSetupRequired(false);
  };

  const logout = () => {
    removeAuthToken();
    setUser(null);
    setTokenState(null);
  };

  const refreshUser = async () => {
    try {
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
    } catch {
      logout();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        setupRequired,
        isLoading,
        login,
        setupAdmin,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
