import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import SimilarArtistDetail from "@/components/dashboard/SimilarArtistDetail";
import { getDashboardData } from "@/lib/getDashboardData";
import { getRelatedOpportunities, getSimilarArtistById } from "@/lib/similarArtist";

interface SimilarArtistDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function SimilarArtistDetailPage({
  params,
}: SimilarArtistDetailPageProps) {
  const { id } = await params;
  const { artist, similarArtists, bookingOpportunities } = await getDashboardData();
  const similarArtist = getSimilarArtistById(similarArtists, id);

  if (!similarArtist) {
    return (
      <MainLayout>
        <div className="max-w-lg">
          <Link
            href="/similar-artists"
            className="text-xs text-accent-light hover:text-white transition-colors"
          >
            ← Back to Similar Artists
          </Link>
          <h1 className="text-xl font-bold text-white mt-4">Similar artist not found</h1>
          <p className="text-sm text-gray-400 mt-1.5">
            We couldn&apos;t find a similar artist with this ID. It may have been removed or
            the link is incorrect.
          </p>
        </div>
      </MainLayout>
    );
  }

  const relatedOpportunities = getRelatedOpportunities(bookingOpportunities, similarArtist.id);

  return (
    <MainLayout>
      <SimilarArtistDetail
        artist={similarArtist}
        referenceArtistGenres={artist.genres}
        relatedOpportunities={relatedOpportunities}
      />
    </MainLayout>
  );
}
