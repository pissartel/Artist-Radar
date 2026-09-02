"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/brand/Logo";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { clearArtistRadarResponse } from "@/lib/artistRadarResponseCache";
import type { ArtistCandidate } from "./ArtistIdentify";

function formatCount(value: number | null): string {
  return value === null ? "Unknown" : new Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

function inferredScale(followers: number | null): string {
  if (followers === null) return "Unknown";
  if (followers < 10_000) return "Emerging";
  if (followers < 100_000) return "Developing";
  if (followers < 1_000_000) return "Established";
  return "Major";
}

export default function ArtistConfirm() {
  const router = useRouter();
  const [artist, setArtist] = useState<ArtistCandidate | null>(null);
  const [genre, setGenre] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [target, setTarget] = useState("");

  useEffect(() => {
    try {
      const value = JSON.parse(window.sessionStorage.getItem("nextstageArtistSelection") ?? "") as ArtistCandidate;
      setArtist(value);
      setGenre(value.genres[0] ?? "");
      setCity(value.city ?? "");
      setCountry(value.country ?? "");
    } catch {
      router.replace("/");
    }
  }, [router]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!artist || !genre.trim() || !(city.trim() || country.trim())) return;
    window.localStorage.setItem(
      "artistRadarOnboardingData",
      JSON.stringify({
        artistName: artist.name,
        spotifyUrl: artist.spotifyUrl ?? "",
        youtubeUrl: "",
        instagramUrl: "",
        websiteUrl: "",
        countryOfOrigin: country.trim() || target.trim() || city.trim(),
        city: city.trim() || country.trim(),
        mainGenre: genre.trim(),
        secondaryGenres: artist.genres.slice(1).join(", "),
        targetLocation: target.trim(),
        mainGoal: "booking_opportunities",
        useChartmetricEnrichment: false,
        chartmetricToggleVisible: false,
        usePreviewData: false,
        previewDataToggleVisible: false,
        guestCreatedAt: new Date().toISOString(),
      })
    );
    clearArtistRadarResponse();
    router.push("/analyzing");
  }

  if (!artist) return null;

  return (
    <main className="animate-ns-in mx-auto flex min-h-screen w-full max-w-[560px] flex-col gap-[26px] px-5 py-14">
      <header className="flex items-center justify-between">
        <Logo />
        <button type="button" onClick={() => router.back()} className="ns-btn text-sm font-semibold text-foreground-muted hover:text-foreground">Back</button>
      </header>
      <div className="flex gap-1.5" aria-label="Step 2 of 3">
        <i className="h-[3px] flex-1 rounded-full bg-accent-text" />
        <i className="h-[3px] flex-1 rounded-full bg-accent-text" />
        <i className="h-[3px] flex-1 rounded-full bg-white/10" />
      </div>
      <section>
        <h1 className="text-[30px] font-extrabold tracking-[-.02em]">This is what we know</h1>
        <p className="mt-2 text-[15px] text-foreground-secondary">Pulled automatically. Correct anything that is wrong, everything else can wait.</p>
      </section>
      <form onSubmit={submit} className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center gap-4">
          {artist.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artist.imageUrl} alt={artist.name} className="h-[68px] w-[68px] rounded-full border-2 border-primary/40 object-cover" />
          ) : (
            <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-gradient-brand text-xl font-extrabold" aria-hidden="true">{artist.name[0]}</span>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-[26px] font-extrabold tracking-[-.02em]">{artist.name}</h2>
            <p className="text-[13px] font-semibold text-foreground-muted">{artist.genres.join(" · ") || "Genre needs confirmation"}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="rounded-[10px] border border-border bg-background p-3">
            <span className="font-mono text-[10px] uppercase tracking-[.08em] text-muted">Base</span>
            <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" className="mt-1 border-0 bg-transparent p-0 text-[15px] font-bold focus:shadow-none" />
          </label>
          <label className="rounded-[10px] border border-border bg-background p-3">
            <span className="font-mono text-[10px] uppercase tracking-[.08em] text-muted">Country</span>
            <Input value={country} onChange={(event) => setCountry(event.target.value)} placeholder="Country" className="mt-1 border-0 bg-transparent p-0 text-[15px] font-bold focus:shadow-none" />
          </label>
          <div className="rounded-[10px] border border-border bg-background p-3">
            <span className="font-mono text-[10px] uppercase tracking-[.08em] text-muted">Followers</span>
            <strong className="mt-1 block text-[15px]">{formatCount(artist.followers)}</strong>
          </div>
          <div className="rounded-[10px] border border-border bg-background p-3 sm:col-start-3">
            <span className="font-mono text-[10px] uppercase tracking-[.08em] text-muted">Scale</span>
            <strong className="mt-1 block text-[15px]">{inferredScale(artist.followers)}</strong>
          </div>
        </div>
        <label className="text-[13px] font-semibold text-foreground-secondary">
          Main genre
          <Input required value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="e.g. Indie pop" className="mt-2" />
        </label>
        <label className="text-[13px] font-semibold text-foreground-secondary">
          Where do you want to play? <span className="text-muted">Optional</span>
          <Input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="e.g. France, Belgium, Germany" className="mt-2" />
        </label>
        <Button variant="gradient" className="w-full py-[15px] text-base">Analyze my artist</Button>
      </form>
      <p className="text-center text-[13px] font-semibold text-muted">Takes about two minutes. You can close this tab and come back.</p>
    </main>
  );
}
