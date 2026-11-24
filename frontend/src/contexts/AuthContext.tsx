"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@/types/auth';
import {
  fetchCurrentUser,
  fetchSetupStatus,
  getAuthToken,
  isNetworkOrServerDownError,
  loginApi,
  removeAuthToken,
  setAuthToken,
  setupMasterAdmin,
} from '@/utils/api';
import { useNotificationStore } from '@/stores/notificationStore';
import { useLocaleStore } from '@/stores/localeStore';

interface AuthContextType {
  user: User | null;
  token: string | null;
  setupRequired: boolean | null;
  isLoading: boolean;
  reconnectAttempts: number;
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
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);

  useEffect(() => {
    let ignore = false;
    let retryTimer: NodeJS.Timeout | null = null;

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
              if (isNetworkOrServerDownError(err)) {
                // Backend went down or is restarting; retry rather than resetting session
                throw err;
              }
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

        if (!ignore) {
          setReconnectAttempts(0);
          setIsLoading(false);
        }
      } catch (err) {
        if (ignore) return;
        if (isNetworkOrServerDownError(err)) {
          // Backend is restarting or offline: keep loading state active and retry until fully loaded
          setReconnectAttempts((prev) => prev + 1);
          setIsLoading(true);
          retryTimer = setTimeout(checkStatus, 1200);
          return;
        }
        console.error('Failed to query Paladio setup status', err);
        setIsLoading(false);
      }
    }

    checkStatus();
    return () => {
      ignore = true;
      if (retryTimer) clearTimeout(retryTimer);
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

  const holidayDatesJson = Array.isArray(user?.preferences?.holiday_dates)
    ? JSON.stringify(user.preferences.holiday_dates.map(String))
    : null;
  const homeCountryPref =
    typeof user?.preferences?.home_country === 'string' ? user.preferences.home_country : null;
  const homeCityPref =
    typeof user?.preferences?.home_city === 'string' ? user.preferences.home_city : '';

  useEffect(() => {
    useNotificationStore.getState().initUser(user?.id || null);
    const userLang = user?.preferences?.preferred_language as string | undefined;
    if (userLang) {
      useLocaleStore.getState().setLocale(userLang);
    }
    if (typeof window !== 'undefined' && user) {
      try {
        if (holidayDatesJson !== null) {
          localStorage.setItem('paladio_user_holidays', holidayDatesJson);
          window.dispatchEvent(new Event('paladio_holidays_synced'));
        }
        if (homeCountryPref) {
          localStorage.setItem('paladio_home_country', homeCountryPref);
          localStorage.setItem('paladio_home_city', homeCityPref);
          window.dispatchEvent(new Event('paladio_home_location_changed'));
        }
      } catch {
        // Ignore storage quota errors
      }
    }
  }, [user, user?.id, user?.preferences?.preferred_language, holidayDatesJson, homeCountryPref, homeCityPref]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        setupRequired,
        isLoading,
        reconnectAttempts,
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

export function useOptionalAuth(): AuthContextType | null {
  return useContext(AuthContext);
}
