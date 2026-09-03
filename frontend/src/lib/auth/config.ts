export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getAuthConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Authentication is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return { url, anonKey };
}

export type OAuthProvider = "google" | "apple";

/** OAuth buttons are opt-in so an unconfigured Supabase provider can never be a dead end. */
export function enabledOAuthProviders(): OAuthProvider[] {
  const providers: OAuthProvider[] = [];
  if (process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true") providers.push("google");
  if (process.env.NEXT_PUBLIC_AUTH_APPLE_ENABLED === "true") providers.push("apple");
  return providers;
}
