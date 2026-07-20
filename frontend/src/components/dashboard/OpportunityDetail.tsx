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
  getAdditionalMetadata,
  getCardFamily,
  getDisplayTitle,
  getGroupedContacts,
  getNegativeMatchFactors,
  getNeutralMatchFactors,
  getOrganizationTypeLabel,
  getPositiveMatchFactors,
  getRecommendedAction,
  getUrlHostname,
  hasLiveEventInfo,
  isLiveEventOpportunity,
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

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-foreground-muted w-20 flex-shrink-0">{label}</span>
      <span className="text-foreground-secondary">{value}</span>
    </div>
  );
}

function TagList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="text-[11px] text-foreground-secondary bg-white/5 border border-border px-1.5 py-0.5 rounded-md"
        >
          {item}
        </span>
      ))}
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
  const positiveFactors = getPositiveMatchFactors(opportunity);
  const negativeFactors = getNegativeMatchFactors(opportunity);
  const neutralFactors = getNeutralMatchFactors(opportunity);
  const primarySourceUrl = opportunity.sourceUrls?.[0];
  const recommendedAction = getRecommendedAction(opportunity);
  const contactGroups = getGroupedContacts(opportunity);
  const metadataItems = getAdditionalMetadata(opportunity);

  // For live events (concert/festival/opening_slot) the prominent event
  // block below already covers date/time/venue/address/city/headliner, so
  // the generic sections only need to add what it doesn't: deadline and any
  // support acts beyond the headliner.
  const showEventBlock = isLiveEventOpportunity(opportunity) && hasLiveEventInfo(opportunity);

  const dateRows = showEventBlock
    ? [{ label: "Deadline", value: opportunity.deadline }]
    : [
        { label: "Date", value: formattedDate },
        { label: "Deadline", value: opportunity.deadline },
      ];
  const hasDateSection = dateRows.some((row) => Boolean(row.value));

  const hasVenueSection =
    !showEventBlock &&
    Boolean(opportunity.venue || opportunity.address || (opportunity.city && opportunity.country));

  // The full announced lineup (headliner + support) is already surfaced by
  // the Details block above via `opportunity.lineup`; this section only adds
  // what that block doesn't: a standalone headliner callout and org rosters.
  const showHeadlinerInLineupSection = !showEventBlock && (opportunity.headliner?.length ?? 0) > 0;
  const hasLineupSection = showHeadlinerInLineupSection || (opportunity.roster?.length ?? 0) > 0;

  return (
    <div className="max-w-3xl">
      <Link
        href="/booking"
        className="text-xs text-accent-text hover:text-foreground transition-colors"
      >
        ← Back to Opportunities
      </Link>

      {/* 1. Name, type, relevance score. Date and location sit in the
          subtitle right below, so both stay visible without scrolling. */}
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
        {/* 2. Prominent event details for live opportunities. */}
        {showEventBlock && (
          <div className={buildCardClassName("stat", "border-border-accent bg-accent-tint")}>
            <SectionTitle>Event details</SectionTitle>
            <div className="flex flex-col gap-1.5">
              <InfoRow label="Date" value={formattedDate} />
              <InfoRow label="Time" value={opportunity.time} />
              <InfoRow label="Venue" value={opportunity.venue} />
              <InfoRow label="Address" value={opportunity.address} />
              <InfoRow label="City" value={opportunity.city} />
              <InfoRow label="Headliner" value={opportunity.headliner?.join(", ")} />
            </div>
            {primarySourceUrl && (
              <a
                href={primarySourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-xs text-accent-text hover:text-foreground transition-colors"
              >
                {getUrlHostname(primarySourceUrl) ?? primarySourceUrl} ↗
              </a>
            )}
          </div>
        )}

        {/* 3. Type-adapted facts (venue/organization/event). */}
        <OpportunityDetailFacts opportunity={opportunity} />

        {/* 4. Date and deadline. */}
        {hasDateSection && (
          <div className={cardClassName}>
            <SectionTitle>Date &amp; deadline</SectionTitle>
            <div className="flex flex-col gap-1.5">
              {dateRows.map((row) => (
                <InfoRow key={row.label} label={row.label} value={row.value} />
              ))}
            </div>
          </div>
        )}

        {/* 5. Venue and location. */}
        {hasVenueSection && (
          <div className={cardClassName}>
            <SectionTitle>Venue &amp; location</SectionTitle>
            <div className="flex flex-col gap-1.5">
              <InfoRow label="Venue" value={opportunity.venue} />
              <InfoRow label="Address" value={opportunity.address} />
              <InfoRow label="City" value={opportunity.city} />
              <InfoRow label="Country" value={opportunity.country} />
            </div>
          </div>
        )}

        {/* 6. Headliner callout / organization roster. */}
        {hasLineupSection && (
          <div className={cardClassName}>
            <SectionTitle>{(opportunity.roster?.length ?? 0) > 0 ? "Roster" : "Lineup"}</SectionTitle>
            <div className="flex flex-col gap-2">
              {showHeadlinerInLineupSection && (
                <p className="text-sm text-foreground-secondary">
                  <span className="text-foreground-muted">Headliner: </span>
                  {opportunity.headliner!.join(", ")}
                </p>
              )}
              <TagList items={opportunity.roster ?? []} />
            </div>
          </div>
        )}

        {/* 7. Relevance score breakdown. */}
        <MatchFactorSection title="Good fit" factors={positiveFactors} tone="success" />
        <MatchFactorSection title="Things to consider" factors={negativeFactors} tone="warning" />
        <MatchFactorSection title="Unknown / not verified" factors={neutralFactors} tone="neutral" />

        {/* 8. Recommended action. */}
        {recommendedAction && (
          <div className={cardClassName}>
            <SectionTitle>Recommended action</SectionTitle>
            <p className="text-sm text-foreground-secondary leading-relaxed">{recommendedAction}</p>
          </div>
        )}

        {/* 9. Contacts, grouped by purpose — kept separate from the source
            evidence links below. */}
        {contactGroups.length > 0 && (
          <div className={cardClassName}>
            <SectionTitle>Contacts</SectionTitle>
            <div className="flex flex-col gap-3">
              {contactGroups.map((group) => (
                <div key={group.purpose}>
                  <p className="text-[10px] font-semibold text-foreground-muted uppercase tracking-wide mb-1">
                    {group.label}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {group.contacts.map((contact) => (
                      <li
                        key={`${contact.purpose}-${contact.value}`}
                        className="text-sm text-foreground-secondary"
                      >
                        {contact.url ? (
                          <a
                            href={contact.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent-text hover:text-foreground transition-colors"
                          >
                            {contact.value}
                          </a>
                        ) : (
                          contact.value
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
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

        {/* 10. Source evidence — the original listing(s), not a contact channel. */}
        {opportunity.sourceUrls && opportunity.sourceUrls.length > 0 && (
          <div className={cardClassName}>
            <SectionTitle>Source evidence</SectionTitle>
            <ul className="flex flex-col gap-1.5">
              {opportunity.sourceUrls.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent-text hover:text-foreground transition-colors break-all"
                  >
                    {getUrlHostname(url) ?? url} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 11. Additional metadata. */}
        {metadataItems.length > 0 && (
          <div className={cardClassName}>
            <SectionTitle>Additional metadata</SectionTitle>
            <div className="flex flex-col gap-1.5">
              {metadataItems.map((item) => (
                <InfoRow key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </div>
        )}

        <div className={cardClassName}>
          <OpportunityActions opportunity={opportunity} variant="full" />
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
