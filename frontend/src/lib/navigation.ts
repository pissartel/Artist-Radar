import { productFeatures } from "@/lib/productFeatures";

export interface NavItem {
  label: string;
  href: string;
}

const BASE_NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/overview" },
  { label: "Similar Artists", href: "/similar-artists" },
  { label: "Booking", href: "/booking" },
  { label: "Industry", href: "/industry" },
];

// Settings is a placeholder shell with no real functionality yet — hidden
// from navigation until it's built. See src/lib/productFeatures.ts.
export const NAV_ITEMS: NavItem[] = productFeatures.settings
  ? [...BASE_NAV_ITEMS, { label: "Settings", href: "/settings" }]
  : BASE_NAV_ITEMS;

/** Public marketing landing page. */
export const LANDING_ROUTE = "/";

/** MVP entry point — redirects into the product flow (currently the onboarding form). */
export const MVP_ENTRY_ROUTE = "/app";
