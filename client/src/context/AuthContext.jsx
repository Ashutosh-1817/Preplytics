import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api, { setAccessToken, registerAuthHandlers } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true); // true until we've checked for an existing session

  const logout = useCallback(() => {
    setUser(null);
    setAccessToken(null);
  }, []);

  useEffect(() => {
    registerAuthHandlers({
      onRefreshed: () => {}, // token itself lives in api.js's closure; nothing else needed here
      onFailure: logout,     // refresh failed entirely (expired/stolen token) — force logout
    });
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setAccessToken(data.data.accessToken);
    setUser(data.data.user);
    return data.data.user;
  }, []);

  const signup = useCallback(async (name, email, password) => {
    const { data } = await api.post('/auth/signup', { name, email, password });
    setAccessToken(data.data.accessToken);
    setUser(data.data.user);
    return data.data.user;
  }, []);

  const logoutRequest = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      logout();
    }
  }, [logout]);

  // On first load, attempt a silent refresh — if the user has a valid
  // refresh cookie from a previous session, this logs them back in
  // without re-entering credentials. If it fails, they just see the
  // login page, which is the correct fallback.
  useEffect(() => {
    const attemptSilentLogin = async () => {
      try {
        const { data } = await api.post('/auth/refresh');
        setAccessToken(data.data.accessToken);

        const me = await api.get('/auth/me');
        setUser(me.data.data);
      } catch {
        // No valid session — expected for a fresh visitor, not an error
      } finally {
        setIsLoading(false);
      }
    };

    attemptSilentLogin();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout: logoutRequest }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);