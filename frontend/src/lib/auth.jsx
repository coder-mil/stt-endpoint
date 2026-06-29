import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, mintCsrf } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: mint a CSRF token + try to load /auth/me.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await mintCsrf();
        const me = await api.me();
        if (mounted) setUser(me.user);
      } catch {
        // 401 = no session, stay logged out
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    await mintCsrf();
    const r = await api.login({ email, password });
    setUser(r.user);
    return r;
  }, []);

  const register = useCallback(async (data) => {
    await mintCsrf();
    const r = await api.register(data);
    return r;
  }, []);

  const logout = useCallback(async () => {
    try {
      await mintCsrf();
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside <AuthProvider>');
  return ctx;
}
