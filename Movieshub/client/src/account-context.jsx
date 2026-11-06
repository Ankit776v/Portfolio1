import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './auth.jsx';
const Context = createContext(null);
export function AccountProvider({ children }) {
  const { user, loading: authLoading, send, completeAuthentication, logout } = useAuth();
  const [account, setAccount] = useState(null);
  const [activeId, setActiveId] = useState(() => sessionStorage.getItem('movieshub_profile') || '');
  const [error, setError] = useState('');
  async function api(path = '', method = 'GET', data) {
    const result = await send('/api/account' + path, { method, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
    if (result.user && path === "" && method === "PATCH") completeAuthentication(result);
    if (result.user) setAccount(result.user);
    return result;
  }
  useEffect(() => {
    let cancelled = false;
    if (user) send('/api/account', {}).then(result => { if (!cancelled) { setAccount(result.user); setError(''); } }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [user, send]);
  const currentAccount = user && account?.id === user.id ? account : null;
  const profile = currentAccount?.profiles.find(p => p.id === activeId && p.unlocked) || currentAccount?.profiles.find(p => !p.hasPin);
  const value = { loading: authLoading || Boolean(user && !currentAccount && !error), account: currentAccount, profile, error, api, select(id) { setActiveId(id); sessionStorage.setItem('movieshub_profile',id); }, async signOut() { try { await send('/api/auth/logout', { method: 'POST', body: '{}' }); } catch (error) { if (error.status !== 401) throw error; } setAccount(null); setActiveId(''); sessionStorage.removeItem('movieshub_profile'); logout(); }, deleted() { setAccount(null); setActiveId(''); sessionStorage.removeItem('movieshub_profile'); logout(); } };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export function useAccount() { return useContext(Context); }
