import Link from "next/link";
import type { SimilarArtist } from "@/types";
import SimilarArtistCard from "./SimilarArtistCard";

interface SimilarArtistsSectionProps {
  artists: SimilarArtist[];
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
        <Link
          href="/similar-artists"
          className="text-xs text-accent-light hover:text-white transition-colors"
        >
          View all
        </Link>
      </div>
      {artists.length > 0 ? (
        <div className="flex flex-row gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {artists.map((artist) => (
            <SimilarArtistCard key={artist.id} artist={artist} variant="compact" />
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-slate-400/10 shadow-card p-6 text-center">
          <p className="text-sm text-gray-500">No similar artists found yet.</p>
          <p className="text-xs text-gray-600 mt-1">
            Try a broader genre or location to widen the search.
          </p>
        </div>
      )}
    </section>
  );
}
