import type { ArtistProfile, PlatformType } from "@/types";
import Badge from "@/components/ui/Badge";

const PLATFORM_LABELS: Record<PlatformType, string> = {
  spotify: "SP",
  instagram: "IG",
  youtube: "YT",
  website: "Web",
};

interface ArtistHeaderProps {
  artist: ArtistProfile;
}

export default function ArtistHeader({ artist }: ArtistHeaderProps) {
  const formattedListeners =
    artist.monthlyListeners >= 1000
      ? `${(artist.monthlyListeners / 1000).toFixed(1)}K`
      : artist.monthlyListeners.toString();

  const growthSign = artist.growthPercent >= 0 ? "+" : "";
  const growthColor =
    artist.growthPercent >= 0 ? "text-success-text" : "text-danger-text";

  return (
    <div className="bg-surface rounded-xl border border-border shadow-card-glow p-5 mb-6 flex items-start gap-4 sm:gap-5">
      <div
        className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-accent-tint flex items-center justify-center flex-shrink-0 overflow-hidden ${
          artist.imageUrl ? "" : "border-2 border-accent-tint"
        }`}
      >

        {artist.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artist.imageUrl}
            alt={artist.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-accent-text text-2xl sm:text-3xl font-bold">
            {artist.name.charAt(0)}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">
            {artist.name}
          </h1>
          {artist.verified && <Badge variant="accent">Verified</Badge>}
        </div>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {artist.genres.map((genre) => (
            <span
              key={genre}
              className="text-xs px-2 py-0.5 rounded-full bg-accent-tint text-accent-text border border-accent-tint"
            >
              {genre}
            </span>
          ))}
          <span className="text-foreground-disabled select-none">·</span>
          <span className="text-sm text-foreground-secondary">{artist.location}</span>
        </div>

        <div className="flex items-center gap-5 mt-3 flex-wrap">
          <div>
            <p className="text-[10px] text-foreground-muted uppercase tracking-wider mb-0.5">
              Monthly Listeners
            </p>
            <p className="text-sm font-semibold text-foreground">
              {formattedListeners}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-foreground-muted uppercase tracking-wider mb-0.5">
              Growth
            </p>
            <p className={`text-sm font-semibold ${growthColor}`}>
              {growthSign}
              {artist.growthPercent}%
            </p>
          </div>

          {artist.platforms && artist.platforms.length > 0 && (
            <div className="flex items-center gap-1.5">
              {artist.platforms.map((platform) =>
                platform.url ? (
                  <a
                    key={platform.type}
                    href={platform.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-2 py-1 rounded-md bg-white/5 border border-border text-foreground-secondary font-medium hover:text-foreground hover:border-border-accent transition-colors"
                  >
                    {PLATFORM_LABELS[platform.type]}
                  </a>
                ) : (
                  <span
                    key={platform.type}
                    className="text-xs px-2 py-1 rounded-md bg-white/5 border border-border text-foreground-secondary font-medium"
                  >
                    {PLATFORM_LABELS[platform.type]}
                  </span>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
