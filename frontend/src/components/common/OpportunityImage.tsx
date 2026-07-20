"use client";

import { useState } from "react";

interface OpportunityImageProps {
  src?: string | null;
  alt: string;
  variant?: "thumbnail" | "hero";
  className?: string;
}

// Poster/event image with a fixed-size container so it never causes layout
// shift, and a letter-avatar fallback (never a broken-image icon) when there
// is no image or it fails to load. Never renders an arbitrary/unrelated
// image — only the backend-provided, source-verified imageUrl.
export default function OpportunityImage({ src, alt, variant = "thumbnail", className = "" }: OpportunityImageProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  const sizeClass = variant === "hero" ? "w-full aspect-[16/9]" : "w-11 h-11 flex-shrink-0";

  return (
    <div
      className={`${sizeClass} rounded-xl bg-accent-tint border border-accent-tint overflow-hidden flex items-center justify-center ${className}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src ?? undefined}
          alt={alt}
          className="w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-accent-text text-base font-semibold" aria-hidden="true">
          {alt.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}
