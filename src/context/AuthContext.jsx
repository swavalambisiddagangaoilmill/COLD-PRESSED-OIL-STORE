import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getProfile, logoutAccount } from "../services/authService.js";
import { clearAuthTokens, setAuthTokens } from "../api/apiClient.js";

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null), [loading, setLoading] = useState(true);
  const refreshAuth = useCallback(async () => { try { const data = await getProfile(); setAuthTokens(); setUser(data.user); return data.user; } catch { clearAuthTokens(); setUser(null); return null; } finally { setLoading(false); } }, []);
  useEffect(() => { refreshAuth(); }, [refreshAuth]);
  const logout = useCallback(async () => { await logoutAccount(); setUser(null); }, []);
  const value = useMemo(() => ({ token: null, user, loading, authenticated: Boolean(user), logout, refreshAuth }), [user, loading, logout, refreshAuth]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth must be used within AuthProvider"); return value; }
