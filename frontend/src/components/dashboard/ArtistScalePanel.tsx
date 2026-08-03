import type { ArtistScale, ArtistScaleComparison } from "@/types";
import { cardClassName as buildCardClassName } from "@/components/ui/Card";
import {
  ARTIST_SCALE_BAND_LABELS,
  ARTIST_SCALE_CLASSIFICATION_LABELS,
  ARTIST_SCALE_CONFIDENCE_LABELS,
  getArtistScaleConfidenceClass,
} from "@/lib/artistScale";

const cardClassName = buildCardClassName("stat");

interface ArtistScalePanelProps {
  artistScale?: ArtistScale;
}

// Issue #219: positions the analyzed artist's cross-platform artistScaleScore
// against its similar artists. Renders nothing when the score itself isn't
// available (nothing meaningful to show); when only the *comparison* is
// unavailable (too few similar-artist scores), the score/band still render
// but the comparison degrades to an explanatory note instead of numbers —
// never a misleading percentile.
export default function ArtistScalePanel({ artistScale }: ArtistScalePanelProps) {
  if (!artistScale || artistScale.artistScaleScore === null) {
    return null;
  }

  const { artistScaleScore, artistScaleBand, confidence, comparison } = artistScale;

  return (
    <div className={`${cardClassName} mb-6`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xs font-semibold text-foreground-secondary uppercase tracking-widest">
            Artist Scale Score
          </h2>
          <p className="text-xs text-foreground-muted mt-1">
            Your cross-platform audience size compared to your similar artists.
          </p>
        </div>
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border whitespace-nowrap ${getArtistScaleConfidenceClass(confidence)}`}
        >
          {ARTIST_SCALE_CONFIDENCE_LABELS[confidence]}
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-foreground tabular-nums">{artistScaleScore}</span>
          <span className="text-xs text-foreground-muted">/ 100</span>
          {artistScaleBand && (
            <span className="text-[10px] text-accent-text bg-accent-tint border border-accent-tint px-1.5 py-0.5 rounded-md ml-1">
              {ARTIST_SCALE_BAND_LABELS[artistScaleBand]}
            </span>
          )}
        </div>
        <div className="mt-2 h-2 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full bg-accent-text" style={{ width: `${artistScaleScore}%` }} />
        </div>
      </div>

      {comparison.available ? (
        <ComparisonView comparison={comparison} artistScaleScore={artistScaleScore} />
      ) : (
        <p className="text-xs text-foreground-disabled mt-4 pt-4 border-t border-border-subtle">
          {comparison.reason === "insufficient_similar_artist_scores"
            ? "Not enough similar artists have a reliable scale score yet to show a comparison."
            : "Your artist scale score isn't available yet to show a comparison."}
        </p>
      )}
    </div>
  );
}

function ComparisonView({
  comparison,
  artistScaleScore,
}: {
  comparison: ArtistScaleComparison;
  artistScaleScore: number;
}) {
  const { median, minimum, maximum, percentile, differenceToMedian, classification, sampleSize } = comparison;
  const min = minimum ?? Math.min(artistScaleScore, 0);
  const max = maximum ?? Math.max(artistScaleScore, 100);
  const range = Math.max(max - min, 1);
  const artistPosition = clampPercent(((artistScaleScore - min) / range) * 100);
  const medianPosition = median !== null ? clampPercent(((median - min) / range) * 100) : null;

  return (
    <div className="mt-5 pt-4 border-t border-border-subtle">
      <div className="flex items-center justify-between gap-3 flex-wrap text-xs mb-3">
        <span className="text-foreground-secondary font-medium">
          {classification ? ARTIST_SCALE_CLASSIFICATION_LABELS[classification] : "—"}
        </span>
        <span className="text-foreground-muted">
          Based on {sampleSize} similar artist{sampleSize === 1 ? "" : "s"}
        </span>
      </div>

      <div className="relative h-2 rounded-full bg-white/5">
        {medianPosition !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-foreground-muted"
            style={{ left: `${medianPosition}%` }}
            title={`Median similar artist: ${median}`}
          />
        )}
        <div
          className="absolute top-1/2 w-2.5 h-2.5 rounded-full bg-accent-text border-2 border-surface"
          style={{ left: `${artistPosition}%`, transform: "translate(-50%, -50%)" }}
          title={`Your artist: ${artistScaleScore}`}
        />
      </div>

      <dl className="grid grid-cols-4 gap-2 text-center mt-4">
        <div>
          <dt className="text-[9px] uppercase tracking-widest text-foreground-muted">Median</dt>
          <dd className="text-xs font-semibold text-foreground mt-0.5">{median ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-widest text-foreground-muted">Percentile</dt>
          <dd className="text-xs font-semibold text-foreground mt-0.5">
            {percentile !== null ? `${percentile}%` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-widest text-foreground-muted">Vs. median</dt>
          <dd className="text-xs font-semibold text-foreground mt-0.5">
            {differenceToMedian !== null
              ? `${differenceToMedian > 0 ? "+" : ""}${differenceToMedian}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-widest text-foreground-muted">Range</dt>
          <dd className="text-xs font-semibold text-foreground mt-0.5">
            {minimum ?? "—"}–{maximum ?? "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
