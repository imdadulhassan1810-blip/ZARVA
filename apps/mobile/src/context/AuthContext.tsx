import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@oneapp/shared";
import { api, hasToken } from "../lib/api";
import { registerForPushNotificationsAsync } from "../lib/notifications";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string; phone?: string }) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (await hasToken()) {
        try {
          setUser(await api.me());
        } catch {
          await api.logout();
        }
      }
      setLoading(false);
    })();
  }, []);

  // Register (or re-register) this device's push token whenever we have a logged-in
  // user. Fully best-effort — failures (permission denied, no EAS project linked
  // yet, offline) are swallowed inside registerForPushNotificationsAsync.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        try {
          await api.registerPushToken(token);
        } catch (err) {
          console.warn("Failed to save push token:", err);
        }
      }
    })();
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await api.login({ email, password });
    setUser(user);
  }, []);

  const register = useCallback(
    async (input: { name: string; email: string; password: string; phone?: string }) => {
      const { user } = await api.register(input);
      setUser(user);
    },
    [],
  );

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const { user } = await api.loginWithGoogle(idToken);
    setUser(user);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
