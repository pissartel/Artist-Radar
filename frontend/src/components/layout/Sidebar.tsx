import Link from "next/link";

interface NavItem {
  label: string;
  href: string;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Similar Artists", href: "/similar-artists" },
  { label: "Booking", href: "/booking" },
  { label: "Settings", href: "/settings" },
];

export default function Sidebar() {
  return (
    <aside className="w-56 min-h-screen bg-sidebar flex flex-col py-8 px-4 border-r border-white/5">
      <div className="mb-10 px-2">
        <span className="text-accent-light font-bold text-lg tracking-tight">
          Artist Radar
        </span>
      </div>
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="px-3 py-2 rounded-md text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
