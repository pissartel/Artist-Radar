export interface NavItem {
  label: string;
  href: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/overview" },
  { label: "Similar Artists", href: "/similar-artists" },
  { label: "Booking", href: "/booking" },
  { label: "Settings", href: "/settings" },
];
