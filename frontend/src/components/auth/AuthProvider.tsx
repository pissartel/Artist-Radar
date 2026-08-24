"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { isAuthConfigured } from "@/lib/auth/config";
import { createClient } from "@/lib/auth/client";

interface AuthState {
  user: User | null;
  loading: boolean;
  configured: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  configured: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isAuthConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    if (!configured) return;
    const client = createClient();

    void client.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, [configured]);

  const value = useMemo(() => ({ user, loading, configured }), [user, loading, configured]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
