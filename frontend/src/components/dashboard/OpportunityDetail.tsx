import Link from "next/link";
import type { Opportunity, SimilarArtist } from "@/types";
import { TYPE_LABELS } from "./BookingOpportunityCard";
import MatchReasonsList from "./MatchReasonsList";
import SimilarArtistCard from "./SimilarArtistCard";
import MatchScoreBadge from "@/components/common/MatchScoreBadge";
import { formatOpportunityDate, getUrlHostname } from "@/lib/opportunity";

interface OpportunityDetailProps {
  opportunity: Opportunity;
  relatedArtists: SimilarArtist[];
}

const cardClassName = "bg-surface rounded-xl p-4 border border-border shadow-card";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold text-foreground-muted uppercase tracking-widest mb-3">
      {children}
    </h3>
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
        ← Back to Booking
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

        <div className={cardClassName}>
          <SectionTitle>Actions</SectionTitle>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="text-xs text-primary-foreground bg-primary hover:bg-primary-hover px-3 py-1.5 rounded-lg transition-colors duration-150"
            >
              Save
            </button>
            {primarySourceUrl ? (
              <a
                href={primarySourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent-text hover:text-foreground border border-border-subtle hover:border-border-accent-hover hover:bg-accent-tint px-3 py-1.5 rounded-lg transition-all duration-150"
              >
                Open source
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="text-xs text-foreground-disabled border border-border px-3 py-1.5 rounded-lg cursor-not-allowed"
              >
                Open source
              </button>
            )}
            <button
              type="button"
              className="text-xs text-accent-text hover:text-foreground border border-border-subtle hover:border-border-accent-hover hover:bg-accent-tint px-3 py-1.5 rounded-lg transition-all duration-150"
            >
              Generate outreach draft
            </button>
            <button
              type="button"
              className="text-xs text-accent-text hover:text-foreground border border-border-subtle hover:border-border-accent-hover hover:bg-accent-tint px-3 py-1.5 rounded-lg transition-all duration-150"
            >
              Mark as contacted
            </button>
          </div>
        </div>

        <details className={cardClassName}>
          <summary className="text-[10px] font-semibold text-foreground-muted uppercase tracking-widest cursor-pointer">
            Raw data (debug)
          </summary>
          <pre className="text-[11px] text-foreground-muted bg-background rounded-lg p-3 mt-3 overflow-x-auto">
            {JSON.stringify(opportunity, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
