"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/auth/client";
import { useAuth } from "./AuthProvider";

const STORAGE_KEY = "artistRadarOnboardingData";

export default function WorkspacePersistence() {
  const { user, configured } = useAuth();

  useEffect(() => {
    if (!configured || !user) return;
    const userId = user.id;

    async function synchronizeWorkspace() {
      const client = createClient();
      let localWorkspace: unknown = null;
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) localWorkspace = JSON.parse(stored);
      } catch {
        // Storage can be unavailable in privacy-focused browser contexts.
      }

      if (localWorkspace) {
        await client.from("artist_workspaces").upsert({
          user_id: userId,
          onboarding_data: localWorkspace,
          updated_at: new Date().toISOString(),
        });
        return;
      }

      const { data } = await client
        .from("artist_workspaces")
        .select("onboarding_data")
        .eq("user_id", userId)
        .maybeSingle();
      if (data?.onboarding_data) {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data.onboarding_data));
          window.dispatchEvent(new Event("artist-radar-workspace-restored"));
        } catch {
          // The session remains usable even when local persistence is blocked.
        }
      }
    }

    void synchronizeWorkspace();
  }, [configured, user]);

  return null;
}
