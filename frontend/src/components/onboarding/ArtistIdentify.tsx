"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "@/components/brand/Logo";

export interface ArtistCandidate {
  id: string;
  name: string;
  genres: string[];
  city: string | null;
  country: string | null;
  followers: number | null;
  imageUrl: string | null;
  spotifyUrl: string | null;
  deezerUrl?: string | null;
  sources: string[];
  bestMatch: boolean;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function SearchState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="font-extrabold">{title}</h2>
      <p className="mt-2 text-sm text-foreground-secondary">{body}</p>
      <button type="button" onClick={action} className="ns-btn mt-4 text-sm font-bold text-accent-text">
        Search again
      </button>
    </div>
  );
}

export default function ArtistIdentify() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";
  const [items, setItems] = useState<ArtistCandidate[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    setItems(null);
    setError(false);
    fetch(`/api/artist-search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((value: { candidates: ArtistCandidate[] }) => setItems(value.candidates))
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(true);
      });
    return () => controller.abort();
  }, [query, router]);

  function select(item: ArtistCandidate) {
    window.sessionStorage.setItem("nextstageArtistSelection", JSON.stringify(item));
    router.push("/start/confirm");
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = String(data.get("artist") ?? "").trim();
    if (value) router.replace(`/start?q=${encodeURIComponent(value)}`);
  }

  if (!query) {
    return (
      <main className="animate-ns-in mx-auto flex min-h-screen w-full max-w-[560px] flex-col gap-[26px] px-5 py-14">
        <header className="flex items-center justify-between"><Logo /><button type="button" onClick={() => router.push("/")} className="text-sm font-semibold text-foreground-muted">Back</button></header>
        <section><h1 className="text-[30px] font-extrabold">Let&apos;s find your artist</h1><p className="mt-2 text-[15px] text-foreground-secondary">Enter the artist name you want to analyze.</p></section>
        <form onSubmit={submitSearch} className="flex flex-col gap-3"><input name="artist" aria-label="Artist name" required autoFocus placeholder="Your artist name" className="ns-input min-h-14 rounded-xl border border-input-border bg-input-background px-[18px] text-base focus:border-primary focus:outline-none focus:shadow-focus" /><button className="ns-btn min-h-14 rounded-xl bg-gradient-brand px-7 font-bold text-white">Find my artist</button></form>
      </main>
    );
  }

  return (
    <main className="animate-ns-in mx-auto flex min-h-screen w-full max-w-[560px] flex-col gap-[26px] px-5 py-14">
      <header className="flex items-center justify-between">
        <Logo />
        <button type="button" onClick={() => router.back()} className="ns-btn text-sm font-semibold text-foreground-muted hover:text-foreground">
          Back
        </button>
      </header>
      <div className="flex gap-1.5" aria-label="Step 1 of 3">
        <i className="h-[3px] flex-1 rounded-full bg-accent-text" />
        <i className="h-[3px] flex-1 rounded-full bg-white/10" />
        <i className="h-[3px] flex-1 rounded-full bg-white/10" />
      </div>
      <section>
        <h1 className="text-[30px] font-extrabold tracking-[-.02em]">Which one is you?</h1>
        <p className="mt-2 text-[15px] text-foreground-secondary">
          We found {items?.length ?? ""} artists matching <strong className="text-foreground">{query}</strong>. Pick yours and we pull the rest from the streaming platforms.
        </p>
      </section>

      {!items && !error && (
        <div className="flex flex-col gap-2.5" aria-label="Searching for artists">
          {[1, 2, 3].map((number) => (
            <div key={number} className="flex gap-3.5 rounded-xl border border-border bg-surface p-4">
              <span className="h-[52px] w-[52px] shrink-0 rounded-full bg-surface-elevated animate-ns-sheen" />
              <span className="flex flex-1 flex-col justify-center gap-2">
                <i className="h-3 w-[44%] rounded-md bg-surface-elevated animate-ns-sheen" />
                <i className="h-2.5 w-[66%] rounded-md bg-surface-elevated animate-ns-sheen" />
              </span>
            </div>
          ))}
        </div>
      )}
      {error && <SearchState title="We could not search right now" body="Check your connection and try the artist search again." action={() => window.location.reload()} />}
      {items?.length === 0 && <SearchState title="We could not find that artist" body="Check the spelling or try a Spotify artist URL." action={() => router.push("/")} />}

      {Boolean(items?.length) && (
        <div className="flex flex-col gap-2.5">
          {items?.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => select(item)}
              className={`ns-card flex min-h-[86px] items-center gap-3.5 rounded-xl border p-4 text-left active:scale-[.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text ${item.bestMatch ? "border-primary/30 bg-[#1A1922] hover:bg-[#1F1D28]" : "border-border bg-surface hover:border-white/[.12] hover:bg-[#1A1922]"}`}
            >
              <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-gradient-brand font-extrabold" aria-hidden="true">
                {initials(item.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 font-extrabold">
                  {item.name}
                  {item.bestMatch && <b className="rounded-full bg-success-tint px-2 py-0.5 text-[11px] text-success-text">Best match</b>}
                </span>
                <span className="block text-[13px] font-semibold text-foreground-muted">
                  {[item.genres.slice(0, 2).join(" · "), item.city, item.country, item.followers && `${item.followers.toLocaleString()} followers`].filter(Boolean).join(" · ") || "Profile details available after selection"}
                </span>
                <span className="font-mono text-xs text-muted">{item.sources.join(" · ")}</span>
              </span>
              <span className="text-[13px] font-bold text-accent-text">Select</span>
            </button>
          ))}
          <button type="button" onClick={() => router.push("/")} className="ns-btn min-h-11 rounded-xl border border-dashed border-border-subtle p-3.5 text-sm font-semibold text-foreground-muted hover:text-foreground">
            None of these — search again
          </button>
        </div>
      )}
    </main>
  );
}
