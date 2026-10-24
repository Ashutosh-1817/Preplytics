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

  // "Continue with Google": the server verifies Google's token, then we get a normal session
  const googleLogin = useCallback(async (credential) => {
    const { data } = await api.post('/auth/google', { credential });
    setAccessToken(data.data.accessToken);
    setUser(data.data.user);
    return data.data.user;
  }, []);

  // Signup no longer logs anyone in: it creates an unverified account and emails a code.
  // Resolves with { needsVerification, email, emailSent, waitSeconds }.
  const signup = useCallback(async (name, email, password) => {
    const { data } = await api.post('/auth/signup', { name, email, password });
    return data.data;
  }, []);

  // Entering the emailed code verifies the address AND starts the session
  const verifyEmail = useCallback(async (email, code) => {
    const { data } = await api.post('/auth/verify-email', { email, code });
    setAccessToken(data.data.accessToken);
    setUser(data.data.user);
    return data.data.user;
  }, []);

  const resendCode = useCallback(async (email) => {
    const { data } = await api.post('/auth/resend-code', { email });
    return data.data;
  }, []);

  const forgotPassword = useCallback((email) => api.post('/auth/forgot-password', { email }), []);

  const resetPassword = useCallback((email, code, password) => api.post('/auth/reset-password', { email, code, password }), []);

  const updateUser = useCallback((patch) => setUser((u) => (u ? { ...u, ...patch } : u)), []);

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
    <AuthContext.Provider value={{ user, isLoading, login, googleLogin, signup, verifyEmail, resendCode, forgotPassword, resetPassword, updateUser, logout: logoutRequest }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);