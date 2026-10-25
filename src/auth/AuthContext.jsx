import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAccessToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Restore the session on first paint: try the access token, then the
      // refresh cookie.
      try {
        const { user: me } = await api.get('/auth/me');
        if (!cancelled) setUser(me);
      } catch {
        try {
          const me = await api.refreshSession();
          if (!cancelled) setUser(me);
        } catch {
          if (!cancelled) setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.post('/auth/login', { username, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await api.post('/auth/register', payload);
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // clear local state regardless
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  const reload = useCallback(async () => {
    const { user: me } = await api.get('/auth/me');
    setUser(me);
    return me;
  }, []);

  const value = useMemo(() => {
    const permissions = new Set(user?.permissions ?? []);
    const roles = new Set(user?.roles?.map((r) => r.key) ?? []);
    return {
      user,
      loading,
      login,
      register,
      logout,
      reload,
      can: (permission) => permissions.has(permission),
      hasRole: (roleKey) => roles.has(roleKey),
    };
  }, [user, loading, login, register, logout, reload]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
