import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import OpportunityDetail from "@/components/dashboard/OpportunityDetail";
import { getDashboardData } from "@/lib/getDashboardData";
import { getOpportunityById } from "@/lib/opportunity";

interface OpportunityDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OpportunityDetailPage({
  params,
}: OpportunityDetailPageProps) {
  const { id } = await params;
  const { bookingOpportunities, similarArtists } = await getDashboardData();
  const opportunity = getOpportunityById(bookingOpportunities, id);

  if (!opportunity) {
    return (
      <MainLayout>
        <div className="max-w-lg">
          <Link
            href="/booking"
            className="text-xs text-accent-light hover:text-white transition-colors"
          >
            ← Back to Booking
          </Link>
          <h1 className="text-xl font-bold text-white mt-4">Opportunity not found</h1>
          <p className="text-sm text-gray-400 mt-1.5">
            We couldn&apos;t find an opportunity with this ID. It may have been removed or the
            link is incorrect.
          </p>
        </div>
      </MainLayout>
    );
  }

  const relatedArtists = similarArtists.filter((artist) =>
    opportunity.relatedSimilarArtistIds?.includes(artist.id),
  );

  return (
    <MainLayout>
      <OpportunityDetail opportunity={opportunity} relatedArtists={relatedArtists} />
    </MainLayout>
  );
}
