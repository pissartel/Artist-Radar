"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/auth/client";
import { useAuth } from "./AuthProvider";
import { synchronizeOnboardingWorkspace } from "@/lib/workspaceOnboarding";

export default function WorkspacePersistence() {
  const { user, configured } = useAuth();

  useEffect(() => {
    if (!configured || !user) return;
    const userId = user.id;

    async function synchronizeWorkspace() {
      const client = createClient();
      // The server validates the HTTP-only anonymous claim token and moves the
      // analysis atomically. The browser never receives the token itself.
      await fetch("/api/anonymous-analysis/claim", { method: "POST" }).catch(() => undefined);
      await synchronizeOnboardingWorkspace({
        storage: window.localStorage,
        readRemote: async () => {
          const { data } = await client
            .from("artist_workspaces")
            .select("onboarding_data")
            .eq("user_id", userId)
            .maybeSingle();
          return data?.onboarding_data ?? null;
        },
        persistLocal: async (localWorkspace) => {
          await client.from("artist_workspaces").upsert({
            user_id: userId,
            onboarding_data: localWorkspace,
            updated_at: new Date().toISOString(),
          });
        },
        notifyRestored: () => {
          window.dispatchEvent(new Event("artist-radar-workspace-restored"));
        },
      }).catch(() => undefined);
    }

    void synchronizeWorkspace();
  }, [configured, user]);

  return null;
}
