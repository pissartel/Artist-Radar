import Link from "next/link";
import type { ReactNode } from "react";
import type { Opportunity, SimilarArtist } from "@/types";
import { TYPE_LABELS } from "./BookingOpportunityCard";
import MatchReasonsList from "./MatchReasonsList";
import SimilarArtistCard from "./SimilarArtistCard";
import MatchScoreBadge from "@/components/common/MatchScoreBadge";
import {
  formatOpportunityDate,
  getUrlHostname,
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

export default function OpportunityDetail({
  opportunity,
  relatedArtists,
}: OpportunityDetailProps) {
  const formattedDate = formatOpportunityDate(opportunity.date);
  const primarySourceUrl = opportunity.sourceUrls?.[0];

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
          <div className="w-12 h-12 rounded-xl bg-accent-tint border border-accent-tint flex items-center justify-center flex-shrink-0">
            <span className="text-accent-text text-lg font-semibold">
              {opportunity.title.charAt(0)}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">{opportunity.title}</h1>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md border text-accent-text bg-accent-tint border-accent-tint whitespace-nowrap">
                {TYPE_LABELS[opportunity.type] ?? opportunity.type}
              </span>
            </div>
            <p className="text-sm text-foreground-muted mt-1">
              {opportunity.location}
              {opportunity.city && opportunity.country && (
                <span> · {opportunity.city}, {opportunity.country}</span>
              )}
              {formattedDate && <span> · {formattedDate}</span>}
            </p>
          </div>
        </div>
        <MatchScoreBadge
          score={opportunity.matchScore}
          size="md"
          label="match"
          className="flex-shrink-0"
        />
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <OpportunityDetailFacts opportunity={opportunity} />

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

        <div className={cardClassName}>
          <SectionTitle>Why this matches</SectionTitle>
          <MatchReasonsList reasons={opportunity.matchReasons} />
        </div>

        {opportunity.sourceUrls && opportunity.sourceUrls.length > 0 && (
          <div className={cardClassName}>
            <SectionTitle>Sources</SectionTitle>
            <ul className="flex flex-col gap-1.5">
              {opportunity.sourceUrls.map((url) => (
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

        {opportunity.contact && (
          <div className={cardClassName}>
            <SectionTitle>Contact</SectionTitle>
            <p className="text-sm text-foreground-secondary">{opportunity.contact}</p>
          </div>
        )}

        {/* Saving, outreach-draft generation, and contact tracking are
            planned but not implemented yet (product backlog) — only the
            "Open source" link is a real action today. */}
        {primarySourceUrl && (
          <div className={cardClassName}>
            <SectionTitle>Actions</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <a
                href={primarySourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent-text hover:text-foreground border border-border-subtle hover:border-border-accent-hover hover:bg-accent-tint px-3 py-1.5 rounded-lg transition-all duration-150"
              >
                Open source
              </a>
            </div>
          </div>
        )}

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
