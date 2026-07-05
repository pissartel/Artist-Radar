import MainLayout from "@/components/layout/MainLayout";
import SimilarArtistsExplorer from "@/components/dashboard/SimilarArtistsExplorer";
import { getDashboardData } from "@/lib/getDashboardData";

export default async function SimilarArtistsPage() {
  const { similarArtists } = await getDashboardData();

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Similar Artists</h1>
        <p className="text-sm text-gray-400 mt-1.5">
          Explore every similar artist found for your profile to understand your scene
          and find useful references for booking research.
        </p>
      </div>
      <SimilarArtistsExplorer artists={similarArtists} />
    </MainLayout>
  );
}
