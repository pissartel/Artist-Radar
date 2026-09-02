"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthForm from "@/components/auth/AuthForm";
import Logo from "@/components/brand/Logo";
import { readOnboardingRequest } from "@/lib/onboardingRequest";
import { readArtistRadarResponse } from "@/lib/artistRadarResponseCache";

interface Manifest {
  artist: string;
  similarArtists: number | null;
  opportunities: number | null;
  contacts: number | null;
}

function SignupContent() {
  const params = useSearchParams();
  const from = params.get("from");
  const conversion = from === "results" || from === "pipeline";
  const [manifest, setManifest] = useState<Manifest | null>(null);

  useEffect(() => {
    const request = readOnboardingRequest();
    if (!request) return;
    const response = readArtistRadarResponse(request);
    setManifest({
      artist: request.artistName,
      similarArtists: response?.similarArtists.length ?? null,
      opportunities: response?.bookingOpportunities.length ?? null,
      contacts: response?.bookingOpportunities.reduce((count, item) => count + (item.contacts?.length ?? 0), 0) ?? null,
    });
  }, []);

  if (!conversion) {
    return (
      <main className="animate-ns-in min-h-screen bg-background px-5 py-12">
        <div className="mx-auto flex w-full max-w-[400px] flex-col gap-[26px]">
          <Logo size={30} />
          <section>
            <h1 className="text-[26px] font-extrabold tracking-[-.02em]">Create your account</h1>
            <p className="mb-6 mt-1.5 text-[15px] text-foreground-muted">Two fields now. We find your artist next.</p>
            <AuthForm mode="register" />
          </section>
        </div>
      </main>
    );
  }

  const lines = [
    "Artist profile and enriched metadata",
    manifest?.similarArtists == null ? "Similar artists with match reasons" : `${manifest.similarArtists} similar artists with match reasons`,
    manifest?.opportunities == null ? "Scored opportunities" : `${manifest.opportunities} scored opportunities`,
    manifest?.contacts == null ? "Booker and promoter contacts" : `${manifest.contacts} booker and promoter contacts`,
    "Your geographic ecosystem map",
  ];

  return (
    <main className="animate-ns-in flex min-h-screen items-center px-5 py-12">
      <div className="mx-auto grid w-full max-w-[900px] overflow-hidden rounded-[20px] border border-border bg-surface md:grid-cols-[1fr_380px]">
        <section className="p-8 md:border-r md:border-border md:p-10">
          <Logo size={30} />
          <h1 className="mt-8 text-[30px] font-extrabold leading-[1.15] tracking-[-.02em]">{from === "pipeline" ? "We will have it ready for you" : `Save your ${manifest?.artist ?? "artist"} analysis`}</h1>
          <p className="mb-6 mt-2 text-[15px] text-foreground-secondary">{from === "pipeline" ? "The analysis keeps running while you sign up. Results attach to your account the moment they land." : "Create an account and everything you just ran comes with you. Nothing reruns."}</p>
          <AuthForm mode="register" />
        </section>
        <aside className="order-first bg-[#12111A] p-8 md:order-none md:p-10 md:px-8">
          <p className="font-mono text-[10px] uppercase tracking-[.1em] text-muted">What gets saved</p>
          <p className="mt-4 border-b border-border pb-5 text-[15px] font-extrabold">{manifest?.artist ?? "Your artist analysis"}</p>
          <ul className="mt-5 flex flex-col gap-3.5">
            {lines.map((line) => <li key={line} className="flex gap-2.5 text-sm font-semibold text-foreground-secondary"><span className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full bg-success-tint text-[10px] text-success-text">✓</span>{line}</li>)}
          </ul>
          <p className="mt-6 text-[13px] text-muted">Nothing reruns. Your analysis moves over as it is.</p>
        </aside>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return <Suspense><SignupContent /></Suspense>;
}
