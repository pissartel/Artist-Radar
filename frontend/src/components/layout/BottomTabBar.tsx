"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/overview", label: "Overview", icon: "▦" },
  { href: "/similar-artists", label: "Similaires", icon: "◎" },
  { href: "/booking", label: "Opportunités", icon: "⌖" },
  { href: "/booking?view=contacts", label: "Contacts", icon: "▣" },
];

export default function BottomTabBar() {
  const pathname = usePathname();
  return <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-[900] hidden border-t border-border-strong bg-[rgba(11,10,16,.94)] px-[10px] pb-[9px] pt-[7px] backdrop-blur min-[621px]:max-[1080px]:flex max-[620px]:flex">{ITEMS.map((item) => { const active = pathname === item.href.split("?")[0] && (!item.href.includes("?") || false); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-11 flex-1 flex-col items-center gap-1 rounded-[10px] px-1 py-[7px] text-[10.5px] font-bold ${active ? "bg-primary/10 text-accent-text" : "text-foreground-muted"}`}><span className="text-[19px] leading-none" aria-hidden="true">{item.icon}</span>{item.label}</Link>; })}</nav>;
}
