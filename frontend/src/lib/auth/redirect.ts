export const DEFAULT_AUTH_REDIRECT = "/overview";
export const AUTH_REDIRECT_COOKIE = "artist_radar_auth_next";

export function safeRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_AUTH_REDIRECT;
  }

  return value;
}

export function authCallbackUrl(origin: string): string {
  return new URL("/auth/callback", origin).toString();
}

export function persistAuthRedirectIntent(origin: string, next?: string | null): string {
  const secure = new URL(origin).protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AUTH_REDIRECT_COOKIE}=${encodeURIComponent(safeRedirectPath(next))}; Path=/auth/callback; Max-Age=3600; SameSite=Lax${secure}`;
  return authCallbackUrl(origin);
}

export function authRedirectIntent(cookieHeader: string | null): string | null {
  const value = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_REDIRECT_COOKIE}=`))
    ?.slice(AUTH_REDIRECT_COOKIE.length + 1);

  if (!value) return null;
  try {
    return safeRedirectPath(decodeURIComponent(value));
  } catch {
    return null;
  }
}

export function authHref(path: "/login" | "/register" | "/signup", next?: string): string {
  const params = new URLSearchParams();
  if (next) params.set("next", safeRedirectPath(next));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
