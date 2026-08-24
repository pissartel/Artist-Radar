import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAuthConfig } from "./config";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getAuthConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Components cannot set cookies. The browser client refreshes
          // persisted sessions, while route handlers can write them normally.
        }
      },
    },
  });
}
