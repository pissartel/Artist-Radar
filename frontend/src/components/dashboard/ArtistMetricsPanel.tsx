import type { ArtistMetrics, CityOpportunityStat } from "@/types";

interface ArtistMetricsPanelProps {
  metrics?: ArtistMetrics;
  topCities: CityOpportunityStat[];
  similarArtistCount: number;
  opportunityCount: number;
}

const UNAVAILABLE = "—";

function formatCompactNumber(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value.toString();
}

export default function ArtistMetricsPanel({
  metrics,
  topCities,
  similarArtistCount,
  opportunityCount,
}: ArtistMetricsPanelProps) {
  const topMarket = topCities[0];
  const hasSpotifyData = Boolean(
    metrics && (metrics.followers != null || metrics.popularityScore != null || metrics.monthlyListeners != null)
  );

  const stats: { label: string; value: string }[] = [
    {
      label: "Monthly Listeners",
      value: metrics?.monthlyListeners != null ? formatCompactNumber(metrics.monthlyListeners) : UNAVAILABLE,
    },
    {
      label: "Followers",
      value: metrics?.followers != null ? formatCompactNumber(metrics.followers) : UNAVAILABLE,
    },
    {
      label: "Popularity Score",
      value: metrics?.popularityScore != null ? `${metrics.popularityScore}/100` : UNAVAILABLE,
    },
    { label: "Main Genre", value: metrics?.mainGenre ?? UNAVAILABLE },
    { label: "Top Country", value: topMarket?.country || UNAVAILABLE },
    { label: "Top City", value: topMarket?.city ?? UNAVAILABLE },
    {
      label: "Strongest Local Market",
      value: topMarket
        ? `${topMarket.city} (${topMarket.percentage ?? topMarket.opportunityCount}%)`
        : UNAVAILABLE,
    },
    { label: "Similar Artists", value: similarArtistCount.toString() },
    { label: "Opportunities", value: opportunityCount.toString() },
  ];

  return (
    <div className="bg-surface rounded-xl p-4 border border-border shadow-card">
      <h3 className="text-[10px] font-semibold text-foreground-muted uppercase tracking-widest mb-3">
        Artist Metrics
      </h3>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <dt className="text-[10px] text-foreground-muted uppercase tracking-wider mb-0.5 truncate">
              {stat.label}
            </dt>
            <dd className="text-sm font-semibold text-foreground truncate">{stat.value}</dd>
          </div>
        ))}
      </dl>
      {!hasSpotifyData && (
        <p className="text-[11px] text-foreground-muted mt-3">Spotify data unavailable for this artist.</p>
      )}
      {metrics?.spotifyUrl && (
        <a
          href={metrics.spotifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-accent-text hover:text-foreground transition-colors mt-3"
        >
          View on Spotify →
        </a>
      )}
    </div>
  );
}
