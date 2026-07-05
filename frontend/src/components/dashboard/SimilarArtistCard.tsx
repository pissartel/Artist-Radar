import Link from "next/link";
import type { SimilarArtist } from "@/types";

export const TIER_LABELS: Record<string, string> = {
  emerging: "Emerging",
  rising: "Rising",
  established: "Established",
  headliner: "Headliner",
};

export const PLATFORM_LABELS: Record<string, string> = {
  spotify: "Spotify",
  instagram: "Instagram",
  youtube: "YouTube",
  website: "Website",
};

interface SimilarArtistCardProps {
  artist: SimilarArtist;
  variant?: "compact" | "full";
}

export default function SimilarArtistCard({
  artist,
  variant = "compact",
}: SimilarArtistCardProps) {
  if (variant === "compact") {
    return (
      <Link
        href={`/similar-artists/${artist.id}`}
        className="bg-card-alt rounded-xl p-4 border border-slate-400/10 shadow-card flex flex-col gap-3 min-w-[176px] flex-shrink-0 hover:bg-card-hover hover:border-accent/35 hover:shadow-card-hover transition-all duration-200"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="w-10 h-10 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center flex-shrink-0">
            <span className="text-accent-light text-base font-semibold">
              {artist.name.charAt(0)}
            </span>
          </div>
          <span className="text-xs font-semibold text-accent-light bg-accent/15 border border-accent/25 px-2 py-0.5 rounded-full tabular-nums">
            {artist.matchScore}%
          </span>
        </div>
        <div>
          <p className="text-sm font-semibold text-white truncate">{artist.name}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{artist.genres.join(", ")}</p>
          <p className="text-xs text-gray-600 mt-0.5">{artist.location}</p>
        </div>
      </Link>
    );
  }

  return (
    <div className="bg-card rounded-xl p-4 border border-slate-400/10 shadow-card hover:bg-card-hover hover:border-accent/30 hover:shadow-card-hover transition-all duration-200 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center flex-shrink-0">
            <span className="text-accent-light text-base font-semibold">
              {artist.name.charAt(0)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{artist.name}</p>
            <p className="text-xs text-gray-500 truncate">{artist.location}</p>
          </div>
        </div>
        <span className="text-xs font-semibold text-accent-light bg-accent/15 border border-accent/25 px-2 py-0.5 rounded-full tabular-nums flex-shrink-0">
          {artist.matchScore}%
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {artist.genres.map((genre) => (
          <span
            key={genre}
            className="text-[10px] text-gray-400 bg-white/5 border border-slate-400/10 px-1.5 py-0.5 rounded-md"
          >
            {genre}
          </span>
        ))}
        {artist.artistTier && (
          <span className="text-[10px] text-accent-light bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded-md">
            {TIER_LABELS[artist.artistTier] ?? artist.artistTier}
          </span>
        )}
      </div>

      {artist.reason && (
        <p className="text-xs text-gray-400 leading-relaxed">{artist.reason}</p>
      )}

      <div className="flex items-center justify-between gap-2 mt-auto pt-1">
        <div className="flex items-center gap-1.5">
          {(artist.platforms ?? []).length > 0 ? (
            artist.platforms!.map((platform) => (
              <span
                key={platform.type}
                className="text-[10px] text-gray-500 bg-white/5 border border-slate-400/10 px-1.5 py-0.5 rounded-md"
              >
                {PLATFORM_LABELS[platform.type] ?? platform.type}
              </span>
            ))
          ) : (
            <span className="text-[10px] text-gray-700">No platform links yet</span>
          )}
        </div>
        <Link
          href={`/similar-artists/${artist.id}`}
          className="text-xs text-accent-light hover:text-white border border-accent/30 hover:border-accent-light hover:bg-accent/10 px-3 py-1.5 rounded-lg transition-all duration-150 whitespace-nowrap"
        >
          View details
        </Link>
      </div>
    </div>
  );
}
