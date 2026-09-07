// Provides reactive authentication state across the storefront.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clearAuthTokens, getAuthToken, setAuthTokens } from "../api/apiClient.js";
import { getProfile, googleLoginAccount, loginAccount, logoutAccount, refreshAccount, requestCustomerOtp, verifyCustomerOtp } from "../services/authService.js";
import { resolveStoredSession } from "./authSessionState.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getAuthToken());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getAuthToken()));
  const [authError, setAuthError] = useState(null);

  const refreshState = useCallback(() => {
    const nextToken = getAuthToken();
    setUser(null);
    setAuthError(null);
    setLoading(Boolean(nextToken));
    setToken(nextToken);
  }, []);

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
      setAuthError(null);
      setLoading(false);
      return undefined;
    }
    setUser(null);
    setAuthError(null);
    setLoading(true);
    resolveStoredSession({ getProfile, refreshAccount }).then((result) => {
      if (!active) return;
      if (result.status === "confirmed") {
        if (result.token) {
          setAuthTokens(result.token, result.refreshToken);
          setToken(result.token);
        }
        setUser(result.user);
        setAuthError(null);
      } else if (result.status === "unauthenticated") {
        clearAuthTokens();
        setToken(null);
        setUser(null);
      } else {
        setUser(null);
        setAuthError(result.error);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [token]);

  const login = useCallback(async (payload) => {
    const data = await loginAccount(payload);
    if (data.token) {
      setAuthTokens(data.token, data.refreshToken);
      setToken(data.token || getAuthToken());
      setUser(data.user || null);
      setAuthError(null);
    }
    return data;
  }, []);

  const loginWithGoogle = useCallback(async (payload) => {
    const data = await googleLoginAccount(payload);
    setAuthTokens(data.token, data.refreshToken);
    setToken(data.token || getAuthToken());
    setUser(data.user || null);
    setAuthError(null);
    return data;
  }, []);

  const verifyOtp = useCallback(async (payload) => {
    const data = await verifyCustomerOtp(payload);
    setAuthTokens(data.token, data.refreshToken);
    setToken(data.token || getAuthToken());
    setUser(data.user || null);
    setAuthError(null);
    return data;
  }, []);
  const logout = useCallback(async () => {
    setUser(null);
    setAuthError(null);
    try {
      await logoutAccount();
    } finally {
      setToken(null);
    }
  }, []);

  const value = useMemo(() => ({ token, user, loading, authError, authenticated: Boolean(token), login, loginWithGoogle, requestOtp: requestCustomerOtp, verifyOtp, logout, refreshAuth: refreshState }), [token, user, loading, authError, login, loginWithGoogle, verifyOtp, logout, refreshState]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
