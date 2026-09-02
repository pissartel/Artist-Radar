export const DEFAULT_AUTH_REDIRECT = "/overview";

export function safeRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_AUTH_REDIRECT;
  }

  return value;
}

export function authHref(path: "/login" | "/register" | "/signup", next?: string): string {
  const params = new URLSearchParams();
  if (next) params.set("next", safeRedirectPath(next));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
