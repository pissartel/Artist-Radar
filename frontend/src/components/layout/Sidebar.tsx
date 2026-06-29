import Link from "next/link";

interface NavItem {
  label: string;
  href: string;
  icon?: string;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Similar Artists", href: "/similar-artists" },
  { label: "Booking", href: "/booking" },
  { label: "Settings", href: "/settings" },
];

export default function Sidebar() {
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
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-150 group flex items-center gap-2.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white/10 group-hover:bg-accent-light transition-colors flex-shrink-0" />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto pt-6 border-t border-white/5 px-2">
        <p className="text-[10px] text-gray-700 uppercase tracking-widest">
          MVP v0.1
        </p>
      </div>
    </aside>
  );
}
