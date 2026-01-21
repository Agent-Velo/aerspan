import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchJson, onUnauthorized } from '@/api/client';
import type { ApiResponse, UserBase } from '@/api/types';
import { clearStoredUser, getStoredUser, setStoredUser } from '@/lib/storage';

type AuthContextValue = {
  user: UserBase | null;
  loaded: boolean;
  login: (user: UserBase) => void;
  logout: () => Promise<void>;
  refreshSelf: () => Promise<UserBase | null>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loaded: false,
  login: () => {},
  logout: async () => {},
  refreshSelf: async () => null,
});

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUserState] = useState<UserBase | null>(() => getStoredUser());
  const [loaded, setLoaded] = useState(false);

  const login = useCallback((next: UserBase) => {
    setStoredUser(next);
    setUserState(next);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetchJson('/api/user/logout', { skipErrorHandler: true });
    } catch {
      // ignore
    }
    clearStoredUser();
    setUserState(null);
  }, []);

  const refreshSelf = useCallback(async () => {
    const stored = getStoredUser();
    if (!stored) {
      setLoaded(true);
      setUserState(null);
      return null;
    }
    try {
      const res = await fetchJson<ApiResponse<UserBase>>('/api/user/self');
      login(res.data);
      setLoaded(true);
      return res.data;
    } catch {
      clearStoredUser();
      setUserState(null);
      setLoaded(true);
      return null;
    }
  }, [login]);

  useEffect(() => {
    const cleanup = onUnauthorized(() => {
      clearStoredUser();
      setUserState(null);
    });
    return cleanup;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loaded, login, logout, refreshSelf }),
    [user, loaded, login, logout, refreshSelf],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
