import { createContext, useEffect, useMemo, useState } from "react";
import api from "../utils/api";

export const AuthContext = createContext({
  authClaims: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  refreshSession: async () => {},
  sessionExpiresAt: null,
  user: null,
});

function buildAuthState(data, loading = false) {
  return {
    authClaims: data?.auth_claims || null,
    loading,
    sessionExpiresAt: data?.session_expires_at || null,
    user: data?.user || null,
  };
}

export function AuthProvider({ children }) {
  const [state, setState] = useState(buildAuthState(null, true));

  const refreshSession = async () => {
    try {
      const response = await api.get("/api/auth/me");
      const nextState = buildAuthState(response.data);
      setState(nextState);
      return response.data;
    } catch (_) {
      setState(buildAuthState(null));
      return null;
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  const login = async (credentials) => {
    const response = await api.post("/api/auth/login", credentials);
    setState(buildAuthState(response.data));
    return response.data;
  };

  const logout = async () => {
    try {
      await api.post("/api/auth/logout");
    } finally {
      setState(buildAuthState(null));
    }
  };

  const value = useMemo(
    () => ({
      ...state,
      login,
      logout,
      refreshSession,
    }),
    [state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
