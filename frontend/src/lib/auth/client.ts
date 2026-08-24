import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthConfig } from "./config";

let client: SupabaseClient | undefined;

export function createClient() {
  const { url, anonKey } = getAuthConfig();
  client ??= createBrowserClient(url, anonKey);
  return client;
}
