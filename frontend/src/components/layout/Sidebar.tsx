"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { DEBUG_NAV_ITEM, LANDING_ROUTE, NAV_ITEMS } from "@/lib/navigation";
import AuthLinks from "@/components/auth/AuthLinks";
import { useAuth } from "@/components/auth/AuthProvider";
import Logo from "@/components/brand/Logo";
import { buttonClassName } from "@/components/ui/Button";
import { useProductFeatures } from "@/components/providers/ProductFeaturesProvider";

export default function Sidebar() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const { debugUIVisible } = useProductFeatures();
  const [artistName, setArtistName] = useState<string | null>(null);

  useEffect(() => {
    try {
      const data = JSON.parse(window.localStorage.getItem("artistRadarOnboardingData") ?? "null") as { artistName?: unknown } | null;
      if (typeof data?.artistName === "string") setArtistName(data.artistName);
    } catch {
      // The sidebar still works without local storage.
    }
  }, []);

  return (
    <aside className="sticky top-0 hidden h-screen w-[234px] flex-shrink-0 flex-col gap-[26px] border-r border-border px-[18px] py-6 min-[1081px]:flex">
      <div><Logo /></div>
      {artistName && (
        <div className={`flex items-center gap-2.5 rounded-xl border p-[11px] ${user ? "border-primary/30" : "border-border"}`}>
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-primary/40 bg-surface-elevated text-xs font-bold text-accent-text">{artistName[0]}</span>
          <span className="min-w-0 flex-1"><strong className="block truncate text-[13px]">{artistName}</strong><small className={`text-[11px] font-semibold ${user ? "text-accent-text" : "text-muted"}`}>{user ? "Primary artist" : "Not saved yet"}</small></span>
          <span className="text-[11px] text-foreground-disabled">▾</span>
        </div>
      )}
      <nav className="flex flex-col gap-0.5">
        {(debugUIVisible ? [...NAV_ITEMS, DEBUG_NAV_ITEM] : NAV_ITEMS).map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`group flex items-center gap-2.5 rounded-[10px] px-[13px] py-[11px] text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus ${
                isActive
                  ? "text-foreground bg-surface-elevated font-bold"
                  : "text-foreground-muted font-semibold hover:text-foreground hover:bg-white/[0.03]"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full transition-colors flex-shrink-0 ${
                  isActive
                    ? "bg-accent-text"
                    : "bg-white/10 group-hover:bg-accent-text"
                }`}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {!loading && !user && artistName && (
        <aside className="mt-auto rounded-xl border border-primary/20 bg-primary/[.08] p-3.5">
          <p className="text-xs font-bold">Guest analysis</p>
          <p className="mt-1 text-xs text-foreground-muted">Kept on this device for 30 days.</p>
          <Link href="/signup?from=results&next=%2Foverview" className={buttonClassName("secondary", "mt-3 w-full px-3 py-2.5 text-xs")}>Save my analysis</Link>
        </aside>
      )}
      <div className={`${!user && artistName ? "mt-4" : "mt-auto"} pt-6 border-t border-border px-2 flex flex-col gap-3`}>
        <AuthLinks mobile />
        <Link
          href={LANDING_ROUTE}
          className="text-xs font-semibold text-foreground-muted hover:text-foreground transition-colors"
        >
          ← Back to website
        </Link>
        <p className="text-[10px] text-foreground-disabled uppercase tracking-widest">
          MVP v0.1
        </p>
      </div>
    </aside>
  );
}
