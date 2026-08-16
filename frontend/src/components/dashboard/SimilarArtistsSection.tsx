import Link from "next/link";
import type { SimilarArtist } from "@/types";
import { selectOverviewSimilarArtists } from "@/lib/overviewSelection";
import SimilarArtistCard from "./SimilarArtistCard";

interface SimilarArtistsSectionProps {
  artists: SimilarArtist[];
}

export default function SimilarArtistsSection({
  artists,
}: SimilarArtistsSectionProps) {
  const carouselArtists = selectOverviewSimilarArtists(artists);
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-foreground-secondary uppercase tracking-widest">
          Similar Artists
        </h2>
        <Link
          href="/similar-artists"
          className="text-xs text-accent-text hover:text-foreground transition-colors"
        >
          View all
        </Link>
      </div>
      {carouselArtists.length > 0 ? (
        <div className="flex flex-row gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {carouselArtists.map((artist) => (
            <SimilarArtistCard key={artist.id} artist={artist} variant="compact" />
          ))}
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border shadow-card p-6 text-center">
          <p className="text-sm text-foreground-muted">No similar artists found yet.</p>
          <p className="text-xs text-foreground-disabled mt-1">
            Try a broader genre or location to widen the search.
          </p>
        </div>
      )}
    </section>
  );
}
