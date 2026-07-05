"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-56 min-h-screen bg-sidebar flex-col py-8 px-4 border-r border-white/5 flex-shrink-0">
      <div className="mb-10 px-2">
        <span className="text-accent-light font-bold text-lg tracking-tight">
          Artist Radar
        </span>
        <p className="text-[10px] text-gray-600 mt-0.5 uppercase tracking-widest">
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
              className={`px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group flex items-center gap-2.5 ${
                isActive
                  ? "text-white bg-white/5"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full transition-colors flex-shrink-0 ${
                  isActive
                    ? "bg-accent-light"
                    : "bg-white/10 group-hover:bg-accent-light"
                }`}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto pt-6 border-t border-white/5 px-2">
        <p className="text-[10px] text-gray-700 uppercase tracking-widest">
          MVP v0.1
        </p>
      </div>
    </aside>
  );
}
