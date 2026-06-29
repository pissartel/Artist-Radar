import type { SimilarArtist } from "@/types";

interface SimilarArtistsSectionProps {
  artists: SimilarArtist[];
}

function SimilarArtistCard({ artist }: { artist: SimilarArtist }) {
  return (
    <div className="bg-card-alt rounded-xl p-4 border border-slate-400/10 shadow-card flex flex-col gap-3 min-w-[176px] flex-shrink-0 hover:bg-card-hover hover:border-accent/35 hover:shadow-card-hover transition-all duration-200 cursor-default">
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
    </div>
  );
}

export default function SimilarArtistsSection({
  artists,
}: SimilarArtistsSectionProps) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          Similar Artists
        </h2>
        <button
          type="button"
          className="text-xs text-accent-light hover:text-white transition-colors"
        >
          View all
        </button>
      </div>
      <div className="flex flex-row gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {artists.map((artist) => (
          <SimilarArtistCard key={artist.id} artist={artist} />
        ))}
      </div>
    </section>
  );
}
