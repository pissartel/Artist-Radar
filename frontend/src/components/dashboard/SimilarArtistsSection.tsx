import type { Artist } from "@/types";

interface SimilarArtistsSectionProps {
  artists: Artist[];
}

function SimilarArtistCard({ artist }: { artist: Artist }) {
  return (
    <div className="bg-card-alt rounded-lg p-4 border border-white/5 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div className="w-9 h-9 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
          <span className="text-accent-light text-sm font-semibold">
            {artist.name.charAt(0)}
          </span>
        </div>
        {artist.score !== undefined && (
          <span className="text-xs font-medium text-accent-light bg-accent/10 px-2 py-0.5 rounded-full">
            {artist.score}%
          </span>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{artist.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">{artist.genre}</p>
        <p className="text-xs text-gray-600 mt-0.5">{artist.city}</p>
      </div>
    </div>
  );
}

export default function SimilarArtistsSection({
  artists,
}: SimilarArtistsSectionProps) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Similar Artists
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {artists.map((artist) => (
          <SimilarArtistCard key={artist.name} artist={artist} />
        ))}
      </div>
    </section>
  );
}
