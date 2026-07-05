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
      <div className="flex flex-row gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {artists.map((artist) => (
          <SimilarArtistCard key={artist.id} artist={artist} variant="compact" />
        ))}
      </div>
    </section>
  );
}
