import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
const AuthContext = createContext(null);
const API_URL = import.meta.env.VITE_API_URL || import.meta.env.BASE_URL.replace(/\/$/, '');
async function request(path, options = {}) {
  const response = await fetch(API_URL + path, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options.headers } });
  const text = await response.text(); let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { /* Proxy errors can be HTML. */ }
  if (!response.ok) { const error = new Error(body.message || 'Unable to complete your request. Please try again.'); error.status = response.status; throw error; }
  return body;
}
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null), [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    // Discard old script-readable tokens; existing browsers sign in again once.
    localStorage.removeItem('movieshub_token');
    request('/api/auth/me').then(result => { if (active) setUser(result.user); }).catch(() => {}).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const completeAuthentication = useCallback(result => { setUser(result.user); return result.user; }, []);
  const authenticate = useCallback(async (path, credentials) => completeAuthentication(await request(path, { method: 'POST', body: JSON.stringify(credentials) })), [completeAuthentication]);
  const logout = useCallback(() => setUser(null), []);
  const send = useCallback(async (path, options) => { try { return await request(path, options); } catch (error) { if (error.status === 401) setUser(null); throw error; } }, []);
  const value = useMemo(() => ({ user, loading, authenticate, completeAuthentication, send, logout }), [user, loading, authenticate, completeAuthentication, send, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within AuthProvider.'); return context; }
