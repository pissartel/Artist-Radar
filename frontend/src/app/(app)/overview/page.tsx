"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import OverviewExperience, { OverviewError, OverviewSkeleton } from "@/components/overview/OverviewExperience";
import { useArtistRadarData } from "@/lib/useArtistRadarData";

export default function OverviewPage() {
  const { state, refetch } = useArtistRadarData();
  const { user, loading: authLoading } = useAuth();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setSaved(query.get("saved") === "1" && window.localStorage.getItem("nextstageSavedBannerDismissed") !== "1");
  }, []);

  if (state.status === "checking-onboarding" || state.status === "loading") return <OverviewSkeleton />;
  if (state.status === "empty") return <div className="ns-overview-main"><div className="ns-panel p-10 text-center"><h1 className="text-lg font-extrabold">Aucune analyse disponible</h1><p className="mt-2 text-sm text-foreground-muted">Identifiez votre projet pour lancer votre première analyse.</p><Link href="/onboarding" className="mt-5 inline-flex rounded-[10px] bg-primary px-5 py-3 text-sm font-bold text-white">Lancer une analyse</Link></div></div>;
  if (state.status === "error") return <OverviewError onRetry={refetch} />;

  return <>
    {saved && user && <aside className="flex items-center gap-3 border-b border-success/20 bg-success/10 px-8 py-3 text-sm font-semibold text-success-text"><span className="flex-1">Votre analyse est enregistrée sur votre compte.</span><button type="button" onClick={() => { localStorage.setItem("nextstageSavedBannerDismissed", "1"); setSaved(false); }}>Fermer</button></aside>}
    {!authLoading && !user && <aside className="flex items-center justify-between gap-4 border-b border-primary/20 bg-primary/[.08] px-8 py-3 text-sm"><span><b>Conservez cette analyse.</b> Créez un compte sans relancer la recherche.</span><Link href="/signup?from=results&next=%2Foverview" className="shrink-0 rounded-[9px] bg-gradient-brand px-4 py-2.5 text-xs font-bold text-white">Enregistrer</Link></aside>}
    <OverviewExperience data={state.data} />
  </>;
}
