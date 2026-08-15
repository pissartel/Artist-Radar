"use client";

import Link from "next/link";
import type { Opportunity, SimilarArtist } from "@/types";
import { PLATFORM_LABELS } from "./SimilarArtistCard";
import MatchReasonsList from "./MatchReasonsList";
import MatchScoreBadge from "@/components/common/MatchScoreBadge";
import { formatOpportunityDate, getUrlHostname } from "@/lib/opportunity";
import {
  formatMonthlyListeners,
  getCommercialExplanation,
  getCommercialTierLabel,
  getNotorietyLabel,
  getScaleFitLabel,
  getSharedGenres,
  hasKnownCommercialScale,
} from "@/lib/similarArtist";
import { cardClassName as buildCardClassName } from "@/components/ui/Card";
import { useProductFeatures } from "@/components/providers/ProductFeaturesProvider";
import {
  ARTIST_SCALE_BAND_LABELS,
  ARTIST_SCALE_CONFIDENCE_LABELS,
  describeRelativeArtistScale,
  getArtistScaleConfidenceClass,
} from "@/lib/artistScale";

interface SimilarArtistDetailProps {
  artist: SimilarArtist;
  analyzedArtistScaleScore?: number | null;
  referenceArtistGenres: string[];
  relatedOpportunities: Opportunity[];
}

const cardClassName = buildCardClassName("stat");

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold text-foreground-muted uppercase tracking-widest mb-3">
      {children}
    </h3>
  );
}

function formatOptionalLabel(value?: string): string | null {
  if (!value) return null;
  return value.replace(/_/g, " ");
}

function buildArtistSubtitle(artist: SimilarArtist, listeners: string | null): string {
  return [artist.location || null, listeners ? `${listeners} monthly listeners` : null]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

function DataSignal({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-foreground-muted">{label}</p>
      <p className="text-sm font-semibold text-foreground mt-1 capitalize">{value}</p>
    </div>
  );
}

export default function SimilarArtistDetail({
  artist,
  analyzedArtistScaleScore,
  referenceArtistGenres,
  relatedOpportunities,
}: SimilarArtistDetailProps) {
  const { debugUIVisible } = useProductFeatures();
  const reasons = artist.matchReasons ?? (artist.reason ? [artist.reason] : []);
  const sharedGenres = getSharedGenres(artist, referenceArtistGenres);
  const listeners = formatMonthlyListeners(artist.monthlyListeners);
  const platforms = artist.platforms ?? [];
  const showCommercialScale = hasKnownCommercialScale(artist.commercialTier);
  const notorietyLabel = getNotorietyLabel(artist);
  const subtitle = buildArtistSubtitle(artist, listeners);
  const hasArtistScale =
    artist.artistScaleScore !== null &&
    artist.artistScaleScore !== undefined &&
    artist.artistScaleBand &&
    artist.artistScaleScoreConfidence &&
    artist.artistScaleScoreConfidence !== "unavailable";

  return (
    <div className="max-w-3xl">
      <Link
        href="/similar-artists"
        className="text-xs text-accent-text hover:text-foreground transition-colors"
      >
        ← Back to Similar Artists
      </Link>

      <div className="mt-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-12 h-12 rounded-full bg-accent-tint flex items-center justify-center flex-shrink-0 overflow-hidden ${
              artist.imageUrl ? "" : "border border-accent-tint"
            }`}
          >
            {artist.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={artist.imageUrl}
                alt={artist.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-accent-text text-lg font-semibold">
                {artist.name.charAt(0)}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">{artist.name}</h1>
              {notorietyLabel && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md border text-foreground-secondary bg-white/5 border-border whitespace-nowrap">
                  {notorietyLabel}
                </span>
              )}
              {showCommercialScale && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md border text-accent-text bg-accent-tint border-accent-tint whitespace-nowrap">
                  {getCommercialTierLabel(artist.commercialTier)}
                </span>
              )}
            </div>
            {subtitle && <p className="text-sm text-foreground-muted mt-1">{subtitle}</p>}
          </div>
        </div>
        <MatchScoreBadge
          score={artist.matchScore}
          size="md"
          label="overall relevance"
          className="flex-shrink-0"
        />
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {hasArtistScale && (
          <div className={cardClassName}>
            <SectionTitle>Artist Scale</SectionTitle>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-base font-semibold text-foreground">
                  {ARTIST_SCALE_BAND_LABELS[artist.artistScaleBand!]} artist
                </p>
                <p className="text-sm text-foreground-secondary mt-1">
                  Score: {artist.artistScaleScore} / 100
                </p>
              </div>
              <span
                className={`text-[10px] font-medium px-2 py-1 rounded-md border ${getArtistScaleConfidenceClass(artist.artistScaleScoreConfidence!)}`}
              >
                {ARTIST_SCALE_CONFIDENCE_LABELS[artist.artistScaleScoreConfidence!]}
              </span>
            </div>
            <p className="text-xs text-foreground-secondary leading-relaxed mt-3">
              {describeRelativeArtistScale(artist.artistScaleScore!, analyzedArtistScaleScore)}
            </p>
          </div>
        )}

        <div className={cardClassName}>
          <SectionTitle>{showCommercialScale ? "Musical match vs. commercial scale" : "Match summary"}</SectionTitle>
          <div className={`grid ${showCommercialScale ? "grid-cols-3" : "grid-cols-2"} gap-3 text-center`}>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-foreground-muted">Musical match</p>
              <p className="text-base font-semibold text-foreground mt-1">
                {artist.musicalMatchScore !== undefined ? `${artist.musicalMatchScore}%` : "—"}
              </p>
            </div>
            {showCommercialScale && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-foreground-muted">Scale fit</p>
                <p className="text-base font-semibold text-foreground mt-1">{getScaleFitLabel(artist.commercialTier)}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-foreground-muted">Overall relevance</p>
              <p className="text-base font-semibold text-foreground mt-1">{artist.matchScore}%</p>
            </div>
          </div>
          {showCommercialScale && (
            <p className="text-xs text-foreground-secondary leading-relaxed mt-4">
              {getCommercialExplanation(artist)}
            </p>
          )}
        </div>

        {artist.genres.length > 0 && (
          <div className={cardClassName}>
            <SectionTitle>Genres</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {artist.genres.map((genre) => (
                <span
                  key={genre}
                  className="text-[10px] text-foreground-secondary bg-white/5 border border-border px-1.5 py-0.5 rounded-md"
                >
                  {genre}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className={cardClassName}>
          <SectionTitle>Why this artist is similar</SectionTitle>
          {reasons.length > 0 ? (
            <MatchReasonsList reasons={reasons} />
          ) : (
            <p className="text-xs text-foreground-disabled">No match reasons available yet.</p>
          )}

          {sharedGenres.length > 0 && (
            <>
              <p className="text-[10px] font-semibold text-foreground-muted uppercase tracking-widest mt-4 mb-2">
                Shared genres
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sharedGenres.map((genre) => (
                  <span
                    key={genre}
                    className="text-[10px] text-accent-text bg-accent-tint border border-accent-tint px-1.5 py-0.5 rounded-md"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className={cardClassName}>
          <SectionTitle>Data signals</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <DataSignal label="Category" value={formatOptionalLabel(artist.bookingCategory)} />
            <DataSignal label="Notoriety" value={notorietyLabel} />
            <DataSignal label="Use" value={formatOptionalLabel(artist.possibleUse)} />
            <DataSignal label="Verification" value={formatOptionalLabel(artist.verificationStatus)} />
            <DataSignal label="Audience" value={listeners ? `${listeners} followers/listeners` : null} />
            <DataSignal label="Scene relevance" value={artist.sceneRelevance !== undefined ? `${artist.sceneRelevance}%` : null} />
            <DataSignal label="Size relevance" value={artist.sizeRelevance !== undefined ? `${artist.sizeRelevance}%` : null} />
            <DataSignal label="Sources" value={artist.sourceUrls?.length ? artist.sourceUrls.length : null} />
          </div>
        </div>

        <div className={cardClassName}>
          <SectionTitle>Platforms</SectionTitle>
          {platforms.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {platforms.map((platform) =>
                platform.url ? (
                  <a
                    key={platform.type}
                    href={platform.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent-text hover:text-foreground border border-border-subtle hover:border-border-accent-hover hover:bg-accent-tint px-2 py-1 rounded-lg transition-all duration-150"
                  >
                    {PLATFORM_LABELS[platform.type] ?? platform.type}
                  </a>
                ) : (
                  <span
                    key={platform.type}
                    className="text-[10px] text-foreground-muted bg-white/5 border border-border px-1.5 py-0.5 rounded-md"
                  >
                    {PLATFORM_LABELS[platform.type] ?? platform.type}
                  </span>
                ),
              )}
            </div>
          ) : (
            <p className="text-xs text-foreground-disabled">No platform links yet.</p>
          )}
        </div>

        {artist.sourceUrls && artist.sourceUrls.length > 0 && (
          <div className={cardClassName}>
            <SectionTitle>Sources</SectionTitle>
            <ul className="flex flex-col gap-1.5">
              {artist.sourceUrls.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent-text hover:text-foreground transition-colors break-all"
                  >
                    {getUrlHostname(url) ?? url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {relatedOpportunities.length > 0 && (
          <div className={cardClassName}>
            <SectionTitle>Related opportunities</SectionTitle>
            <div className="flex flex-col gap-2">
              {relatedOpportunities.map((opportunity) => {
                const formattedDate = formatOpportunityDate(opportunity.date);
                return (
                  <Link
                    key={opportunity.id}
                    href={`/opportunities/${opportunity.id}`}
                    className="block bg-surface-elevated rounded-lg p-3 border border-border hover:border-border-accent hover:bg-surface transition-all duration-200"
                  >
                    <p className="text-sm font-semibold text-foreground">{opportunity.title}</p>
                    <p className="text-xs text-foreground-muted mt-0.5">
                      {opportunity.location}
                      {formattedDate && <span> · {formattedDate}</span>}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* "Use as reference", opportunity discovery from this artist, and
            saving are planned but not implemented yet (product backlog) —
            no actions exist for a similar artist today beyond the platform
            links above. */}

        {debugUIVisible && (
          <details className={cardClassName}>
            <summary className="text-[10px] font-semibold text-foreground-muted uppercase tracking-widest cursor-pointer">
              Raw data (debug)
            </summary>
            <pre className="text-[11px] text-foreground-muted bg-background rounded-lg p-3 mt-3 overflow-x-auto">
              {JSON.stringify(artist, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
