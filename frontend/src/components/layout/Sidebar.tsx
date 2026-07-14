"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandLogo from "@/components/common/BrandLogo";
import { NAV_ITEMS } from "@/lib/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-56 min-h-screen bg-surface flex-col py-8 px-4 border-r border-border flex-shrink-0">
      <div className="mb-10 px-2">
        <BrandLogo size={32} />
        <p className="text-[10px] text-foreground-muted mt-1.5 uppercase tracking-widest">
          Booking Intelligence
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
      <div className="mt-auto pt-6 border-t border-border px-2">
        <p className="text-[10px] text-foreground-disabled uppercase tracking-widest">
          MVP v0.1
        </p>
      </div>
    </aside>
  );
}
