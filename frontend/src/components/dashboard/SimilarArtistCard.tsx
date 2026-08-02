import Link from "next/link";
import type { SimilarArtist } from "@/types";
import { formatGenrePreview, formatMonthlyListeners, getCommercialTierLabel, getScaleFitLabel } from "@/lib/similarArtist";
import MatchScoreBadge from "@/components/common/MatchScoreBadge";
import Card, { cardClassName } from "@/components/ui/Card";

export const PLATFORM_LABELS: Record<string, string> = {
  spotify: "Spotify",
  instagram: "Instagram",
  youtube: "YouTube",
  website: "Website",
};

const MAX_VISIBLE_GENRE_CHIPS = 3;

interface ArtistAvatarProps {
  imageUrl?: string;
  name: string;
  sizeClassName: string;
}

function ArtistAvatar({ imageUrl, name, sizeClassName }: ArtistAvatarProps) {
  return (
    <div
      className={`${sizeClassName} rounded-full bg-accent-tint flex items-center justify-center flex-shrink-0 overflow-hidden ${
        imageUrl ? "" : "border border-accent-tint"
      }`}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span className="text-accent-text text-base font-semibold">{name.charAt(0)}</span>
      )}
    </div>
  );
}

function getSpotifyPlatform(artist: SimilarArtist) {
  return artist.platforms?.find((platform) => platform.type === "spotify" && platform.url);
}

interface SimilarArtistCardProps {
  artist: SimilarArtist;
  variant?: "compact" | "full";
}

export default function SimilarArtistCard({
  artist,
  variant = "compact",
}: SimilarArtistCardProps) {
  const followers = formatMonthlyListeners(artist.monthlyListeners);
  const spotifyPlatform = getSpotifyPlatform(artist);

  if (variant === "compact") {
    return (
      <Link
        href={`/similar-artists/${artist.id}`}
        className={cardClassName("interactive", "flex flex-col gap-3 w-44 flex-shrink-0")}
      >
        <div className="flex items-start justify-between gap-2">
          <ArtistAvatar imageUrl={artist.imageUrl} name={artist.name} sizeClassName="w-10 h-10" />
          <MatchScoreBadge score={artist.matchScore} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{artist.name}</p>
          <p
            className="text-xs text-foreground-secondary mt-0.5 truncate"
            title={artist.genres.join(", ")}
          >
            {formatGenrePreview(artist.genres, MAX_VISIBLE_GENRE_CHIPS)}
          </p>
          <p className="text-xs text-foreground-muted mt-0.5 truncate">
            {artist.location}
            {followers && <span> · {followers} followers</span>}
          </p>
        </div>
        {spotifyPlatform?.url && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              window.open(spotifyPlatform.url, "_blank", "noopener,noreferrer");
            }}
            className="self-start text-[10px] text-accent-text hover:text-foreground border border-border-subtle hover:border-border-accent-hover hover:bg-accent-tint px-2 py-1 rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:shadow-focus"
          >
            Spotify ↗
          </button>
        )}
      </Link>
    );
  }

  const visibleGenres = artist.genres.slice(0, MAX_VISIBLE_GENRE_CHIPS);
  const hiddenGenreCount = artist.genres.length - visibleGenres.length;

  return (
    <Card variant="interactive" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <ArtistAvatar imageUrl={artist.imageUrl} name={artist.name} sizeClassName="w-11 h-11" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{artist.name}</p>
            <p className="text-xs text-foreground-muted truncate">
              {artist.location}
              {followers && <span> · {followers} followers</span>}
            </p>
          </div>
        </div>
        <MatchScoreBadge score={artist.matchScore} label="overall" className="flex-shrink-0" />
      </div>

      <div className="flex flex-wrap gap-1" title={artist.genres.join(", ")}>
        {visibleGenres.map((genre) => (
          <span
            key={genre}
            className="text-[10px] text-foreground-secondary bg-white/5 border border-border px-1.5 py-0.5 rounded-md"
          >
            {genre}
          </span>
        ))}
        {hiddenGenreCount > 0 && (
          <span className="text-[10px] text-foreground-muted bg-white/5 border border-border px-1.5 py-0.5 rounded-md">
            +{hiddenGenreCount}
          </span>
        )}
        {/* Commercial-scale *relationship* to the analyzed artist (issue
            #201) — always rendered, including "Scale unknown", rather than
            the old artistTier badge which silently mislabeled missing data
            as "Emerging". */}
        <span className="text-[10px] text-accent-text bg-accent-tint border border-accent-tint px-1.5 py-0.5 rounded-md">
          {getCommercialTierLabel(artist.commercialTier)}
        </span>
      </div>

      {/* Musical similarity, commercial scale fit, and overall/booking
          relevance are three distinct signals (issue #201) — never
          collapsed into one ambiguous percentage. */}
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-[9px] uppercase tracking-widest text-foreground-muted">Musical match</dt>
          <dd className="text-xs font-semibold text-foreground mt-0.5">
            {artist.musicalMatchScore !== undefined ? `${artist.musicalMatchScore}%` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-widest text-foreground-muted">Scale fit</dt>
          <dd className="text-xs font-semibold text-foreground mt-0.5">{getScaleFitLabel(artist.commercialTier)}</dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-widest text-foreground-muted">Overall relevance</dt>
          <dd className="text-xs font-semibold text-foreground mt-0.5">{artist.matchScore}%</dd>
        </div>
      </dl>

      {artist.reason && (
        <p className="text-xs text-foreground-secondary leading-relaxed">{artist.reason}</p>
      )}

      <div className="flex items-center justify-between gap-2 mt-auto pt-1">
        <div className="flex items-center gap-1.5">
          {(artist.platforms ?? []).length > 0 ? (
            artist.platforms!.map((platform) =>
              platform.url ? (
                <a
                  key={platform.type}
                  href={platform.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-accent-text hover:text-foreground bg-accent-tint border border-accent-tint hover:border-accent-text px-1.5 py-0.5 rounded-md transition-colors"
                >
                  {PLATFORM_LABELS[platform.type] ?? platform.type}
                </a>
              ) : (
                <span
                  key={platform.type}
                  className="text-[10px] text-foreground-muted bg-white/5 border border-border px-1.5 py-0.5 rounded-md"
                >
                  {PLATFORM_LABELS[platform.type] ?? platform.type}
                </span>
              ),
            )
          ) : (
            <span className="text-[10px] text-foreground-disabled">No platform links yet</span>
          )}
        </div>
        <Link
          href={`/similar-artists/${artist.id}`}
          className="text-xs text-accent-text hover:text-foreground border border-border-subtle hover:border-border-accent-hover hover:bg-accent-tint px-3 py-1.5 rounded-lg transition-all duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:shadow-focus"
        >
          View details
        </Link>
      </div>
    </Card>
  );
}
