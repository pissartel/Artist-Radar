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
    <div className="flex items-start gap-5 mb-8">
      <div className="w-20 h-20 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {artist.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artist.imageUrl}
            alt={artist.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-accent-light text-3xl font-bold">
            {artist.name.charAt(0)}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold text-white truncate">
            {artist.name}
          </h1>
          {artist.verified && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-accent/20 text-accent-light border border-accent/30">
              Verified
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {artist.genres.map((genre) => (
            <span
              key={genre}
              className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-300 border border-white/10"
            >
              {genre}
            </span>
          ))}
          <span className="text-gray-600">·</span>
          <span className="text-sm text-gray-400">{artist.location}</span>
        </div>

        <div className="flex items-center gap-4 mt-3 flex-wrap">
          <div>
            <span className="text-xs text-gray-500 uppercase tracking-wider">
              Monthly Listeners
            </span>
            <p className="text-sm font-semibold text-white">
              {formattedListeners}
            </p>
          </div>
          <div>
            <span className="text-xs text-gray-500 uppercase tracking-wider">
              Growth
            </span>
            <p className={`text-sm font-semibold ${growthColor}`}>
              {growthSign}
              {artist.growthPercent}%
            </p>
          </div>

          {artist.platforms && artist.platforms.length > 0 && (
            <div className="flex items-center gap-1.5 ml-2">
              {artist.platforms.map((platform) => (
                <span
                  key={platform.type}
                  className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 text-gray-400 font-medium"
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
