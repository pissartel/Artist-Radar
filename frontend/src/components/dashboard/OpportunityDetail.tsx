"use client";

import Link from "next/link";
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
  getContactAction,
  getDisplayTitle,
  getGroupedContacts,
  getLineupEntries,
  getNegativeMatchFactors,
  getNeutralMatchFactors,
  getOpportunitySignal,
  getOpportunitySourceUrl,
  getOrganizationTypeLabel,
  type OpportunityCardFamily,
  getPositiveMatchFactors,
  getRecommendedAction,
  getSourceEvidence,
  getTicketAction,
  getVenueTypeLabel,
  LINEUP_POSITION_LABELS,
  type OpportunitySignalKind,
} from "@/lib/opportunity";
import { cardClassName as buildCardClassName } from "@/components/ui/Card";
import { useProductFeatures } from "@/components/providers/ProductFeaturesProvider";

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

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-foreground-muted w-24 flex-shrink-0">{label}</span>
      <span className="text-foreground-secondary">{value}</span>
    </div>
  );
}

// Single source of truth for the event/venue/organization facts block (issue
// #132 review feedback: the page used to show this same information split
// across two separate "Details" cards plus a third "Event details" card).
function buildEventInfoRows(opportunity: Opportunity): { label: string; value?: string | null }[] {
  const family = getCardFamily(opportunity);
  const location = [opportunity.city, opportunity.country].filter(Boolean).join(", ") || opportunity.location;
  const venueTypeLabel = getVenueTypeLabel(opportunity);

  let rows: { label: string; value?: string | null }[];

  if (family === "venue") {
    rows = [
      { label: "Location", value: location },
      { label: "Venue", value: opportunity.venue },
      { label: "Venue type", value: venueTypeLabel },
      { label: "Website", value: opportunity.venueWebsite },
      { label: "Address", value: opportunity.address },
      {
        label: "Capacity",
        value: opportunity.venueCapacity != null ? `~${opportunity.venueCapacity.toLocaleString()}` : null,
      },
    ];
  } else if (family === "organization") {
    rows = [
      { label: "Type", value: getOrganizationTypeLabel(opportunity) },
      { label: "Location", value: location },
    ];
  } else {
    rows = [
      { label: "Date", value: formatOpportunityDate(opportunity.date) },
      { label: "Time", value: opportunity.time },
      { label: "Deadline", value: opportunity.deadline },
      { label: "Location", value: location },
      { label: "Venue", value: opportunity.venue },
      { label: "Venue type", value: venueTypeLabel },
      { label: "Website", value: opportunity.venueWebsite },
      { label: "Address", value: opportunity.address },
    ];
  }

  return [...rows, ...getAdditionalMetadata(opportunity)];
}

// A venue opportunity's source is often a listing/agenda page rather than
// the venue's plain homepage — the outbound link should say so instead of
// the misleading "View original event page" (there is no single event) or
// a generic "Visit website" that undersells what the link actually shows.
// The keyword must be the last path segment — "/event/band-a" (an
// individual event permalink) must not be mistaken for a listing page.
const LISTING_PAGE_PATH_PATTERN = /\/(agenda|events?|programme|programmation|calendar|concerts)\/?$/i;

function isListingPageUrl(url: string): boolean {
  try {
    return LISTING_PAGE_PATH_PATTERN.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function getSourceLinkLabel(sourceUrl: string, family: OpportunityCardFamily): string {
  if (family === "venue" || family === "organization") {
    return isListingPageUrl(sourceUrl) ? "View venue programme ↗" : "Visit website ↗";
  }
  return "View original event page ↗";
}

const SIGNAL_TONE_CLASSES: Record<OpportunitySignalKind, string> = {
  support_slot_available: "text-success-text bg-success-tint border-success-tint",
  open_call: "text-accent-text bg-accent-tint border-accent-tint",
  venue_contact: "text-info-text bg-info-tint border-info-tint",
  general_event: "text-foreground-muted bg-surface-elevated border-border",
};

// Makes the kind of opportunity legible at a glance (issue #132 review
// feedback), instead of making the artist infer it from scattered fields.
function OpportunitySignalBanner({ opportunity }: { opportunity: Opportunity }) {
  const signal = getOpportunitySignal(opportunity);
  return (
    <div className={`rounded-xl border px-4 py-3 ${SIGNAL_TONE_CLASSES[signal.kind]}`}>
      <p className="text-sm font-semibold">{signal.label}</p>
      <p className="text-xs mt-0.5 opacity-90">{signal.description}</p>
    </div>
  );
}

function LineupSection({
  opportunity,
  relatedArtists,
}: {
  opportunity: Opportunity;
  relatedArtists: SimilarArtist[];
}) {
  const entries = getLineupEntries(opportunity);
  if (entries.length === 0) return null;

  const relatedByName = new Map(relatedArtists.map((artist) => [artist.name.trim().toLowerCase(), artist]));

  return (
    <div className={cardClassName}>
      <SectionTitle>Line-up</SectionTitle>
      <ul className="flex flex-col gap-2.5">
        {entries.map((entry) => {
          const matchedArtist = relatedByName.get(entry.name.trim().toLowerCase());
          return (
            <li key={entry.name} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-foreground-secondary min-w-0 truncate">
                {entry.name}
                {entry.position && (
                  <span className="ml-2 text-[10px] font-medium text-foreground-muted uppercase tracking-wide">
                    {LINEUP_POSITION_LABELS[entry.position]}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2 flex-shrink-0">
                {matchedArtist && (
                  <Link
                    href={`/similar-artists/${matchedArtist.id}`}
                    className="text-xs text-accent-text hover:text-foreground transition-colors"
                  >
                    View profile
                  </Link>
                )}
                {entry.externalUrl && (
                  <a
                    href={entry.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent-text hover:text-foreground transition-colors"
                  >
                    Artist link ↗
                  </a>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const SUPPORT_SLOT_STATUS_LABELS: Record<NonNullable<Opportunity["supportSlotPotential"]>["status"], string> = {
  likely: "Support slot likely open",
  possible: "Support slot possibly open",
  unlikely: "Support slot unlikely",
  unknown: "Support slot potential unknown",
};

const SUPPORT_SLOT_STATUS_TONE_CLASSES: Record<NonNullable<Opportunity["supportSlotPotential"]>["status"], string> = {
  likely: "text-success-text bg-success-tint border-success-tint",
  possible: "text-success-text bg-success-tint border-success-tint",
  unlikely: "text-warning-text bg-warning-tint border-warning-tint",
  unknown: "text-foreground-muted bg-surface-elevated border-border",
};

// Structured support-slot-potential analysis (issue #158). Renders the
// backend's status/confidence/reasons directly; never restates it as a
// confirmed fact that a slot is available.
function SupportSlotPotentialSection({ opportunity }: { opportunity: Opportunity }) {
  const analysis = opportunity.supportSlotPotential;
  if (!analysis) return null;

  return (
    <div className={cardClassName}>
      <SectionTitle>Support slot potential</SectionTitle>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border whitespace-nowrap ${SUPPORT_SLOT_STATUS_TONE_CLASSES[analysis.status]}`}
        >
          {SUPPORT_SLOT_STATUS_LABELS[analysis.status]}
        </span>
        <span className="text-xs text-foreground-muted">{analysis.confidenceScore}/100 confidence</span>
      </div>
      {analysis.reasons.length > 0 && (
        <ul className="flex flex-col gap-1.5 mt-3">
          {analysis.reasons.map((reason) => (
            <li key={reason} className="text-sm text-foreground-secondary">
              {reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Contacts grouped by purpose, each labeled with its trust source and
// verification state — never an invented or inferred contact (issue #132
// review feedback). External Contact/Get tickets links live here too, next
// to the rest of the contact/booking information instead of at the page
// bottom.
function ContactSection({ opportunity }: { opportunity: Opportunity }) {
  const groups = getGroupedContacts(opportunity);
  const contactAction = getContactAction(opportunity);
  const ticketAction = getTicketAction(opportunity);

  if (groups.length === 0 && !contactAction && !ticketAction) return null;

  return (
    <div className={cardClassName}>
      <SectionTitle>Contact information</SectionTitle>
      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.purpose}>
            <p className="text-[10px] font-semibold text-foreground-muted uppercase tracking-wide mb-1">
              {group.label}
            </p>
            <ul className="flex flex-col gap-1.5">
              {group.contacts.map((contact) => (
                <li key={`${contact.purpose}-${contact.value}`} className="text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
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
                      <span className="text-foreground-secondary">{contact.value}</span>
                    )}
                    <span
                      className={`text-[9px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-md border ${
                        contact.verified
                          ? "text-success-text bg-success-tint border-success-tint"
                          : "text-foreground-muted bg-white/5 border-border"
                      }`}
                    >
                      {contact.verified ? "Verified" : "Unverified"}
                    </span>
                  </div>
                  {contact.source && (
                    <p className="text-[11px] text-foreground-muted mt-0.5">via {contact.source}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {(contactAction || ticketAction) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {contactAction && (
              <a
                href={contactAction.href}
                target={contactAction.href.startsWith("http") ? "_blank" : undefined}
                rel={contactAction.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="text-xs font-medium text-accent-text hover:text-foreground border border-border-subtle hover:border-border-accent-hover hover:bg-accent-tint px-3 py-1.5 rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:shadow-focus"
              >
                {contactAction.label}
              </a>
            )}
            {ticketAction && (
              <a
                href={ticketAction.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-accent-text hover:text-foreground border border-border-subtle hover:border-border-accent-hover hover:bg-accent-tint px-3 py-1.5 rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:shadow-focus"
              >
                {ticketAction.label}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Structured, backend-computed match-analysis factors, kept concise and
// actionable per section (issue #132 review feedback).
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

// Every source used to build this opportunity, each with what it contributed
// and a direct link — not only the domain name (issue #132 review feedback).
function SourceEvidenceSection({ opportunity }: { opportunity: Opportunity }) {
  const evidence = getSourceEvidence(opportunity);
  if (evidence.length === 0) return null;

  return (
    <div className={cardClassName}>
      <SectionTitle>Source evidence</SectionTitle>
      <ul className="flex flex-col gap-3">
        {evidence.map((item) => (
          <li key={item.url} className="text-sm">
            <p className="font-medium text-foreground-secondary">{item.title ?? item.website ?? item.url}</p>
            {item.title && item.website && (
              <p className="text-xs text-foreground-muted">{item.website}</p>
            )}
            {item.retrievedInfo && (
              <p className="text-xs text-foreground-muted mt-0.5">Retrieved: {item.retrievedInfo}</p>
            )}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-1 text-xs text-accent-text hover:text-foreground transition-colors break-all"
            >
              View source ↗
            </a>
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
  const { debugUIVisible } = useProductFeatures();
  const formattedDate = formatOpportunityDate(opportunity.date);
  const title = getDisplayTitle(opportunity);
  const positiveFactors = getPositiveMatchFactors(opportunity);
  const negativeFactors = getNegativeMatchFactors(opportunity);
  const neutralFactors = getNeutralMatchFactors(opportunity);
  const recommendedAction = getRecommendedAction(opportunity);
  const eventInfoRows = buildEventInfoRows(opportunity).filter((row) => Boolean(row.value));
  const originalEventUrl = getOpportunitySourceUrl(opportunity);
  const family = getCardFamily(opportunity);

  // A full poster is shown right below the header when an image is
  // available; the header thumbnail then falls back to the letter avatar so
  // the same picture is never shown twice on the page (issue #132 review
  // feedback).
  const showPoster = Boolean(opportunity.imageUrl);

  return (
    <div className="max-w-3xl">
      <Link
        href="/booking"
        className="text-xs text-accent-text hover:text-foreground transition-colors"
      >
        ← Back to Opportunities
      </Link>

      {/* 1. Header: thumbnail, title, location, date, match score, and the
          bookmark/contacted icon actions. */}
      <div className="mt-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <OpportunityImage
            src={showPoster ? undefined : opportunity.imageUrl}
            alt={title}
            variant="thumbnail"
            className="w-12 h-12"
          />
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
        <div className="flex items-center gap-3 flex-shrink-0">
          <OpportunityActions opportunity={opportunity} variant="compact" />
          <MatchScoreBadge
            score={opportunity.matchScore}
            size="md"
            label="match"
            positiveFactors={positiveFactors}
            negativeFactors={negativeFactors}
            neutralFactors={neutralFactors}
          />
        </div>
      </div>

      {/* 2. Full event poster (never duplicated with the header thumbnail
          above). */}
      {showPoster && (
        <div className="mt-4">
          <OpportunityImage src={opportunity.imageUrl} alt={title} variant="hero" />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        <OpportunitySignalBanner opportunity={opportunity} />

        {/* 3. Event information — a single consolidated section replacing
            the previous duplicated "Details"/"Event details" cards. */}
        {eventInfoRows.length > 0 && (
          <div className={family === "event" ? buildCardClassName("stat", "border-border-accent bg-accent-tint") : cardClassName}>
            <SectionTitle>Event information</SectionTitle>
            <div className="flex flex-col gap-1.5">
              {eventInfoRows.map((row) => (
                <InfoRow key={row.label} label={row.label} value={row.value} />
              ))}
            </div>
            {originalEventUrl && (
              <a
                href={originalEventUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-xs text-accent-text hover:text-foreground transition-colors"
              >
                {getSourceLinkLabel(originalEventUrl, family)}
              </a>
            )}
          </div>
        )}

        {/* 4. Line-up. */}
        <LineupSection opportunity={opportunity} relatedArtists={relatedArtists} />

        {/* 4b. Support slot potential (concert opportunities only). */}
        <SupportSlotPotentialSection opportunity={opportunity} />

        {/* 5. Contact information. */}
        <ContactSection opportunity={opportunity} />

        {/* 6. Match analysis: why it matches, things to consider, missing or
            unverified information, recommended action. */}
        <MatchFactorSection title="Why it matches" factors={positiveFactors} tone="success" />
        <MatchFactorSection title="Things to consider" factors={negativeFactors} tone="warning" />
        <MatchFactorSection title="Missing or unverified information" factors={neutralFactors} tone="neutral" />

        {recommendedAction && (
          <div className={cardClassName}>
            <SectionTitle>Recommended action</SectionTitle>
            <p className="text-sm text-foreground-secondary leading-relaxed">{recommendedAction}</p>
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

        {/* 7. Source evidence. */}
        <SourceEvidenceSection opportunity={opportunity} />

        {debugUIVisible && (
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
