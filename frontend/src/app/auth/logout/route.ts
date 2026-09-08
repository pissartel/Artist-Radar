import { NextResponse } from "next/server";
import { createClient } from "@/lib/auth/server";
import { isAuthConfigured } from "@/lib/auth/config";

export async function POST(request: Request) {
  if (isAuthConfigured()) await (await createClient()).auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
