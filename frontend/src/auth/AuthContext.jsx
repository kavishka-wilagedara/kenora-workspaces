import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() => (tokenStore.get() ? 'loading' : 'anonymous'));
  const [notice, setNotice] = useState('');

  const logout = useCallback((message = '') => {
    tokenStore.clear();
    setUser(null);
    setStatus('anonymous');
    setNotice(message);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler((err) => logout(err.message));
  }, [logout]);

  // Restore the session on page load
  useEffect(() => {
    if (!tokenStore.get()) return;
    api
      .me()
      .then(({ user }) => {
        setUser(user);
        setStatus('authenticated');
      })
      .catch(() => logout());
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const { token, user } = await api.login(email, password);
    tokenStore.set(token);
    setUser(user);
    setStatus('authenticated');
    setNotice('');
    return user;
  }, []);

  const value = useMemo(() => ({ user, status, notice, login, logout }), [user, status, notice, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
