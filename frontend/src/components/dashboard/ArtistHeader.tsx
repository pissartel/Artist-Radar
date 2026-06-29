import type { ArtistProfile, PlatformType } from "@/types";

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
    artist.growthPercent >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="bg-card rounded-xl border border-white/8 shadow-card p-5 mb-6 flex items-start gap-4 sm:gap-5">
      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-accent/20 border-2 border-accent/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {artist.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artist.imageUrl}
            alt={artist.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-accent-light text-2xl sm:text-3xl font-bold">
            {artist.name.charAt(0)}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-bold text-white truncate">
            {artist.name}
          </h1>
          {artist.verified && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-accent/20 text-accent-light border border-accent/40">
              Verified
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {artist.genres.map((genre) => (
            <span
              key={genre}
              className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent-light/80 border border-accent/20"
            >
              {genre}
            </span>
          ))}
          <span className="text-gray-700 select-none">·</span>
          <span className="text-sm text-gray-400">{artist.location}</span>
        </div>

        <div className="flex items-center gap-5 mt-3 flex-wrap">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
              Monthly Listeners
            </p>
            <p className="text-sm font-semibold text-white">
              {formattedListeners}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
              Growth
            </p>
            <p className={`text-sm font-semibold ${growthColor}`}>
              {growthSign}
              {artist.growthPercent}%
            </p>
          </div>

          {artist.platforms && artist.platforms.length > 0 && (
            <div className="flex items-center gap-1.5">
              {artist.platforms.map((platform) => (
                <span
                  key={platform.type}
                  className="text-xs px-2 py-1 rounded-md bg-white/5 border border-white/10 text-gray-400 font-medium hover:text-gray-200 hover:border-white/20 transition-colors"
                >
                  {PLATFORM_LABELS[platform.type]}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
