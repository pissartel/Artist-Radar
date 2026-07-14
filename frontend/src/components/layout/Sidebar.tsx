"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LANDING_ROUTE, NAV_ITEMS } from "@/lib/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-56 min-h-screen bg-surface flex-col py-8 px-4 border-r border-border flex-shrink-0">
      <div className="mb-10 px-2">
        <Image
          src="/brand/logo-next-stage-dark.png"
          alt="NextStage"
          width={136}
          height={32}
          priority
          className="h-8 w-auto"
        />
        <p className="text-[10px] text-foreground-muted mt-1.5 uppercase tracking-widest">
          Opportunity Intelligence
        </p>
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group flex items-center gap-2.5 focus-visible:outline-none focus-visible:shadow-focus ${
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
      <div className="mt-auto pt-6 border-t border-border px-2 flex flex-col gap-3">
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
