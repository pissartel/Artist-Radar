// Server-only environment configuration. Values are validated lazily (on
// first use, i.e. cold start of a given serverless instance) rather than at
// module import time, so `next build` doesn't fail in environments where
// these vars aren't set until deploy time.

interface ServerEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

let cached: ServerEnv | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getServerEnv(): ServerEnv {
  if (!cached) {
    cached = {
      SUPABASE_URL: requireEnv("SUPABASE_URL"),
      SUPABASE_SERVICE_ROLE_KEY: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    };
  }
  return cached;
}
