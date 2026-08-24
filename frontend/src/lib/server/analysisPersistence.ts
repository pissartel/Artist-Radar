import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { isAuthConfigured } from "@/lib/auth/config";
import { createClient } from "@/lib/auth/server";
import type { ArtistRadarRequest, ArtistRadarResponse } from "@/types/artistRadar";

const ANONYMOUS_SESSION_COOKIE = "artist_radar_anonymous_analysis";
const RETENTION_SECONDS = 7 * 24 * 60 * 60;

interface AnonymousSession {
  id: string;
  tokenHash: string;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function analysisFingerprint(request: ArtistRadarRequest): string {
  return hash(JSON.stringify({
    artistName: request.artistName.trim().toLowerCase(),
    genre: request.genre.trim().toLowerCase(),
    location: request.location.trim().toLowerCase(),
    enableBooking: request.enableBooking ?? true,
    spotifyUrl: request.spotifyUrl?.trim() ?? null,
  }));
}

function parseAnonymousSession(value: string | undefined): AnonymousSession | null {
  if (!value) return null;
  const [id, token] = value.split(".");
  if (!id || !token || !/^[0-9a-f-]{36}$/.test(id) || token.length < 32) return null;
  return { id, tokenHash: hash(token) };
}

async function getAnonymousSession(create: boolean): Promise<AnonymousSession | null> {
  const cookieStore = await cookies();
  const existing = parseAnonymousSession(cookieStore.get(ANONYMOUS_SESSION_COOKIE)?.value);
  if (existing || !create) return existing;

  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  cookieStore.set(ANONYMOUS_SESSION_COOKIE, `${id}.${token}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: RETENTION_SECONDS,
  });
  return { id, tokenHash: hash(token) };
}

export async function readPersistedAnalysis(
  request: ArtistRadarRequest
): Promise<ArtistRadarResponse | null> {
  if (!isAuthConfigured()) return null;
  const client = await createClient();
  const fingerprint = analysisFingerprint(request);
  const { data: authData } = await client.auth.getUser();

  if (authData.user) {
    const { data } = await client
      .from("artist_workspaces")
      .select("analysis_result, analysis_fingerprint")
      .eq("user_id", authData.user.id)
      .eq("analysis_fingerprint", fingerprint)
      .maybeSingle();
    return (data?.analysis_result as ArtistRadarResponse | null) ?? null;
  }

  const session = await getAnonymousSession(false);
  if (!session) return null;
  const { data } = await client.rpc("read_anonymous_analysis", {
    requested_session_id: session.id,
    requested_claim_token_hash: session.tokenHash,
    requested_fingerprint: fingerprint,
  });
  return (data as ArtistRadarResponse | null) ?? null;
}

export async function persistAnalysis(
  request: ArtistRadarRequest,
  analysis: ArtistRadarResponse
): Promise<void> {
  if (!isAuthConfigured()) return;
  const client = await createClient();
  const fingerprint = analysisFingerprint(request);
  const { data: authData } = await client.auth.getUser();

  if (authData.user) {
    await client.from("artist_workspaces").upsert({
      user_id: authData.user.id,
      onboarding_data: request,
      analysis_result: analysis,
      analysis_fingerprint: fingerprint,
      updated_at: new Date().toISOString(),
    });
    return;
  }

  const session = await getAnonymousSession(true);
  if (!session) return;
  await client.rpc("store_anonymous_analysis", {
    requested_session_id: session.id,
    requested_claim_token_hash: session.tokenHash,
    requested_fingerprint: fingerprint,
    requested_onboarding_data: request,
    requested_analysis_result: analysis,
  });
}

export async function claimAnonymousAnalysis(): Promise<boolean> {
  if (!isAuthConfigured()) return false;
  const session = await getAnonymousSession(false);
  if (!session) return false;
  const client = await createClient();
  const { data, error } = await client.rpc("claim_anonymous_analysis", {
    requested_session_id: session.id,
    requested_claim_token_hash: session.tokenHash,
  });
  if (!error && data === true) {
    (await cookies()).delete(ANONYMOUS_SESSION_COOKIE);
    return true;
  }
  return false;
}
