import Link from "next/link";
import type { ReactNode } from "react";
import type { MatchFactor, Opportunity, SimilarArtist } from "@/types";
import { TYPE_LABELS } from "./BookingOpportunityCard";
import SimilarArtistCard from "./SimilarArtistCard";
import OpportunityActions from "./OpportunityActions";
import MatchScoreBadge from "@/components/common/MatchScoreBadge";
import OpportunityImage from "@/components/common/OpportunityImage";
import {
  formatOpportunityDate,
  getDisplayTitle,
  getOpportunitySource,
  getOpportunitySourceUrl,
  getPositiveMatchFactors,
  getNegativeMatchFactors,
  getNeutralMatchFactors,
  getCardFamily,
  getOrganizationTypeLabel,
} from "@/lib/opportunity";
import { cardClassName as buildCardClassName } from "@/components/ui/Card";
import { productFeatures } from "@/lib/productFeatures";

interface OpportunityDetailProps {
  opportunity: Opportunity;
  relatedArtists: SimilarArtist[];
}

const cardClassName = buildCardClassName("stat");

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold text-foreground-muted uppercase tracking-widest mb-3">
      {children}
    </h3>
  );
}

function FactRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-foreground-muted">{label}</span>
      <span className="text-foreground-secondary text-right">{value}</span>
    </div>
  );
}

// Type-adapted facts block (issue #130): venues and organizations show
// structured facts a concert/festival card doesn't need, and vice versa.
function OpportunityDetailFacts({ opportunity }: { opportunity: Opportunity }) {
  const family = getCardFamily(opportunity);
  const rows: ReactNode[] = [];

  if (family === "venue") {
    if (opportunity.venueCapacity != null) {
      rows.push(<FactRow key="capacity" label="Estimated capacity" value={`~${opportunity.venueCapacity.toLocaleString()}`} />);
    }
    if (opportunity.genres.length > 0) {
      rows.push(<FactRow key="genres" label="Genres hosted" value={opportunity.genres.join(", ")} />);
    }
    rows.push(
      <FactRow key="contact" label="Contact availability" value={opportunity.contact ? "Available" : "Not found"} />,
    );
    if (opportunity.recentEvents.length > 0) {
      rows.push(<FactRow key="recent" label="Recent relevant events" value={opportunity.recentEvents.join(", ")} />);
    }
  } else if (family === "organization") {
    rows.push(<FactRow key="org-type" label="Organization type" value={getOrganizationTypeLabel(opportunity)} />);
    if (opportunity.genres.length > 0) {
      rows.push(<FactRow key="genres" label="Relevant genres" value={opportunity.genres.join(", ")} />);
    }
    rows.push(
      <FactRow
        key="contact"
        label="Contact or submission"
        value={opportunity.contact ? "Available" : "Not found"}
      />,
    );
  } else {
    if (opportunity.venue) {
      rows.push(<FactRow key="venue" label="Venue" value={opportunity.venue} />);
    }
    if (opportunity.lineup.length > 0) {
      rows.push(<FactRow key="lineup" label="Lineup" value={opportunity.lineup.join(", ")} />);
    }
    if (opportunity.relatedArtist) {
      rows.push(<FactRow key="related" label="Related similar artist" value={opportunity.relatedArtist.name} />);
    }
    if (opportunity.genres.length > 0) {
      rows.push(<FactRow key="genres" label="Relevant genres" value={opportunity.genres.join(", ")} />);
    }
  }

  if (rows.length === 0) return null;

  return (
    <div className={cardClassName}>
      <SectionTitle>Details</SectionTitle>
      <div className="flex flex-col gap-2">{rows}</div>
    </div>
  );
}

// Structured, backend-computed positive/negative factors (issue #130 review
// feedback), replacing the old free-text match-reasons paragraph.
function MatchFactorSection({
  title,
  factors,
  tone,
}: {
  title: string;
  factors: MatchFactor[];
  tone: "success" | "warning" | "neutral";
}) {
  if (factors.length === 0) return null;
  const toneClass = tone === "success" ? "text-success-text" : tone === "warning" ? "text-warning-text" : "text-foreground-muted";
  const icon = tone === "success" ? "✓" : tone === "warning" ? "!" : "?";

  return (
    <div className={cardClassName}>
      <SectionTitle>{title}</SectionTitle>
      <ul className="flex flex-col gap-2">
        {factors.map((factor) => (
          <li key={factor.code} className="flex items-start gap-2 text-sm">
            <span className={`${toneClass} flex-shrink-0`} aria-hidden="true">{icon}</span>
            <span className="text-foreground-secondary">
              {factor.label}
              {factor.detail && factor.detail !== factor.label && (
                <span className="block text-xs text-foreground-muted mt-0.5">{factor.detail}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function OpportunityDetail({
  opportunity,
  relatedArtists,
}: OpportunityDetailProps) {
  const formattedDate = formatOpportunityDate(opportunity.date);
  const title = getDisplayTitle(opportunity);
  const source = getOpportunitySource(opportunity);
  const sourceUrl = getOpportunitySourceUrl(opportunity);
  const positiveFactors = getPositiveMatchFactors(opportunity);
  const negativeFactors = getNegativeMatchFactors(opportunity);
  const neutralFactors = getNeutralMatchFactors(opportunity);

  return (
    <div className="max-w-3xl">
      <Link
        href="/booking"
        className="text-xs text-accent-text hover:text-foreground transition-colors"
      >
        ← Back to Opportunities
      </Link>

      <div className="mt-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <OpportunityImage src={opportunity.imageUrl} alt={title} variant="thumbnail" className="w-12 h-12" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">{title}</h1>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md border text-accent-text bg-accent-tint border-accent-tint whitespace-nowrap">
                {TYPE_LABELS[opportunity.type] ?? opportunity.type}
              </span>
            </div>
            <p className="text-sm text-foreground-muted mt-1">
              {opportunity.location}
              {formattedDate && <span> · {formattedDate}</span>}
            </p>
          </div>
        </div>
        <MatchScoreBadge
          score={opportunity.matchScore}
          size="md"
          label="match"
          className="flex-shrink-0"
          positiveFactors={positiveFactors}
          negativeFactors={negativeFactors}
          neutralFactors={neutralFactors}
        />
      </div>

      {opportunity.imageUrl && (
        <div className="mt-4">
          <OpportunityImage src={opportunity.imageUrl} alt={title} variant="hero" />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        <OpportunityDetailFacts opportunity={opportunity} />

        {opportunity.description.trim() && (
          <div className={cardClassName}>
            <SectionTitle>Description</SectionTitle>
            <p className="text-sm text-foreground-secondary leading-relaxed">{opportunity.description}</p>

            {opportunity.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {opportunity.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] text-foreground-secondary bg-white/5 border border-border px-1.5 py-0.5 rounded-md"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <MatchFactorSection title="Good fit" factors={positiveFactors} tone="success" />
        <MatchFactorSection title="Things to consider" factors={negativeFactors} tone="warning" />
        <MatchFactorSection title="Unknown / not verified" factors={neutralFactors} tone="neutral" />

        {relatedArtists.length > 0 && (
          <div className={cardClassName}>
            <SectionTitle>Related similar artists</SectionTitle>
            <div className="flex flex-row gap-3 overflow-x-auto pb-1 scrollbar-thin">
              {relatedArtists.map((artist) => (
                <SimilarArtistCard key={artist.id} artist={artist} variant="compact" />
              ))}
            </div>
          </div>
        )}

        <div className={cardClassName}>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <OpportunityActions opportunity={opportunity} variant="full" />
          </div>
          {source && sourceUrl && (
            <p className="text-xs text-foreground-muted">
              Source:{" "}
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-text hover:text-foreground underline"
              >
                {source}
              </a>
            </p>
          )}
        </div>

        {productFeatures.rawJson && (
          <details className={cardClassName}>
            <summary className="text-[10px] font-semibold text-foreground-muted uppercase tracking-widest cursor-pointer">
              Raw data (debug)
            </summary>
            <pre className="text-[11px] text-foreground-muted bg-background rounded-lg p-3 mt-3 overflow-x-auto">
              {JSON.stringify(opportunity, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
