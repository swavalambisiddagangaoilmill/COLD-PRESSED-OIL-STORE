// Provides reactive authentication state across the storefront.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clearAuthTokens, getAuthToken, setAuthTokens } from "../api/apiClient.js";
import { getProfile, googleLoginAccount, loginAccount, logoutAccount, registerAccount, requestLoginOtp, resendLoginOtp, verifyLoginOtp } from "../services/authService.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getAuthToken());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getAuthToken()));

  const refreshState = useCallback(() => setToken(getAuthToken()), []);

  useEffect(() => {
    window.addEventListener("ss-oil-mill-auth-change", refreshState);
    window.addEventListener("storage", refreshState);
    return () => {
      window.removeEventListener("ss-oil-mill-auth-change", refreshState);
      window.removeEventListener("storage", refreshState);
    };
  }, [refreshState]);

  useEffect(() => {
    let active = true;
    if (!token) {
      setUser(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    getProfile().then((data) => {
      if (active) setUser(data.user);
    }).catch(() => {
      clearAuthTokens();
      if (active) {
        setToken(null);
        setUser(null);
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [token]);

  const login = useCallback(async (payload) => {
    const data = await loginAccount(payload);
    if (data.token) {
      setAuthTokens(data.token, data.refreshToken);
      setToken(data.token || getAuthToken());
      setUser(data.user || null);
    }
    return data;
  }, []);

  const loginWithGoogle = useCallback(async (payload) => {
    const data = await googleLoginAccount(payload);
    setAuthTokens(data.token, data.refreshToken);
    setToken(data.token || getAuthToken());
    setUser(data.user || null);
    return data;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await registerAccount(payload);
    setAuthTokens(data.token, data.refreshToken);
    setToken(data.token || getAuthToken());
    setUser(data.user || null);
    return data;
  }, []);


  const requestOtp = useCallback((payload) => requestLoginOtp(payload), []);
  const resendOtp = useCallback((payload) => resendLoginOtp(payload), []);

  const verifyOtp = useCallback(async (payload) => {
    const data = await verifyLoginOtp(payload);
    if (data.token) {
      setAuthTokens(data.token, data.refreshToken);
      setToken(data.token || getAuthToken());
      setUser(data.user || null);
    }
    return data;
  }, []);
  const logout = useCallback(async () => {
    await logoutAccount();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ token, user, loading, authenticated: Boolean(token), login, loginWithGoogle, register, requestOtp, resendOtp, verifyOtp, logout, refreshAuth: refreshState }), [token, user, loading, login, loginWithGoogle, register, requestOtp, resendOtp, verifyOtp, logout, refreshState]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
