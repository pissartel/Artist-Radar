import Image from "next/image";

type BrandLogoVariant = "full" | "compact";
type BrandLogoBackground = "dark" | "light";

interface BrandLogoProps {
  /** "full" renders the icon + wordmark lockup, "compact" renders the icon mark only. */
  variant?: BrandLogoVariant;
  /** Which background the logo will sit on, selects the matching lockup asset. */
  background?: BrandLogoBackground;
  /** Rendered height in px. Width is derived to preserve the asset's aspect ratio. */
  size?: number;
  className?: string;
  /** Accessible label. Pass "" for decorative use next to visible brand text. */
  label?: string;
}

// Intrinsic asset ratios (width / height) from public/brand — used so next/image
// reserves the correct box up front and the logo never loads with a layout shift.
const FULL_LOGO_ASPECT_RATIO = 1084 / 256;
const COMPACT_LOGO_ASPECT_RATIO = 1;

const FULL_LOGO_SRC: Record<BrandLogoBackground, string> = {
  dark: "/brand/logo-next-stage-dark.png",
  light: "/brand/logo-next-stage-light.png",
};

// SVG mark, preferred over the PNG per brand technical requirements. Rendered
// as a plain <img> since next/image blocks local SVGs without extra config.
const COMPACT_LOGO_SRC = "/brand/logo-next-stage-mark.svg";

const DEFAULT_SIZE: Record<BrandLogoVariant, number> = {
  full: 32,
  compact: 24,
};

export default function BrandLogo({
  variant = "full",
  background = "dark",
  size,
  className = "",
  label = "NextStage",
}: BrandLogoProps) {
  const height = size ?? DEFAULT_SIZE[variant];

  if (variant === "compact") {
    const width = Math.round(height * COMPACT_LOGO_ASPECT_RATIO);
    return (
      // eslint-disable-next-line @next/next/no-img-element -- SVG asset, kept out of next/image's raster optimizer
      <img
        src={COMPACT_LOGO_SRC}
        alt={label}
        width={width}
        height={height}
        className={`block ${className}`}
        style={{ height, width }}
      />
    );
  }

  const width = Math.round(height * FULL_LOGO_ASPECT_RATIO);
  return (
    <Image
      src={FULL_LOGO_SRC[background]}
      alt={label}
      width={width}
      height={height}
      priority
      className={`block h-auto ${className}`}
      style={{ height, width: "auto" }}
    />
  );
}
