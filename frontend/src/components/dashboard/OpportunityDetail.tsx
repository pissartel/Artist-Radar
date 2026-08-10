"use client";

import Link from "next/link";
import { useState } from "react";
import type { MatchFactor, Opportunity, SimilarArtist } from "@/types";
import type { VenueInfo } from "@/lib/venue";
import type { CachedVenueEnrichment, VenueEnrichment } from "@/types/venueEnrichment";
import { getOfficialVenueLink, VenueEnrichmentSkeleton } from "./VenueDetail";
import { TYPE_LABELS } from "./BookingOpportunityCard";
import SimilarArtistCard from "./SimilarArtistCard";
import OpportunityActions from "./OpportunityActions";
import MatchScoreBadge from "@/components/common/MatchScoreBadge";
import OpportunityImage from "@/components/common/OpportunityImage";
import {
  formatOpportunityDate,
  getAdditionalMetadata,
  getContactActionForValue,
  getCardFamily,
  getContactAction,
  getDisplayTitle,
  getGroupedContacts,
  getLineupCompletenessLabel,
  getLineupEntries,
  isLiveEventOpportunity,
  getNegativeMatchFactors,
  getNeutralMatchFactors,
  getOpportunitySignal,
  getOrganizationTypeLabel,
  type OpportunityCardFamily,
  getPositiveMatchFactors,
  getVenueTypeLabel,
  LINEUP_POSITION_LABELS,
  type OpportunitySignalKind,
} from "@/lib/opportunity";
import { cardClassName as buildCardClassName } from "@/components/ui/Card";
import { useProductFeatures } from "@/components/providers/ProductFeaturesProvider";
import { useVenueEnrichment } from "@/lib/useVenueEnrichment";

interface OpportunityDetailProps {
  opportunity: Opportunity;
  relatedArtists: SimilarArtist[];
  venueInfo?: VenueInfo | null;
}

const cardClassName = buildCardClassName("stat");

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold text-foreground-muted uppercase tracking-widest mb-3">
      {children}
    </h3>
  );
}

// Any value that is itself an absolute http(s) URL must render as a
// clickable link, never raw text (PR #218 review feedback) — the credit
// system that will eventually attribute these links comes later, but the
// links themselves must work now.
function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  const href = isHttpUrl(value) ? value : null;
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-foreground-muted w-24 flex-shrink-0">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-text hover:text-foreground transition-colors break-all"
        >
          {value}
        </a>
      ) : (
        <span className="text-foreground-secondary">{value}</span>
      )}
    </div>
  );
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

function socialLinkLabel(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("instagram")) return "Instagram";
  if (lower.includes("facebook")) return "Facebook";
  if (lower.includes("linkedin")) return "LinkedIn";
  if (lower.includes("twitter") || lower.includes("x.com")) return "X / Twitter";
  return "Social";
}

function buildVenueInfoFromOpportunity(opportunity: Opportunity): VenueInfo {
  return {
    id: opportunity.venueId ?? opportunity.venueOpportunityId ?? opportunity.id,
    name: opportunity.venue ?? opportunity.title,
    imageUrl: opportunity.venueImageUrl ?? opportunity.imageUrl,
    venueTypeLabel: getVenueTypeLabel(opportunity),
    description: opportunity.venueDescription,
    address: opportunity.address,
    postalCode: opportunity.postalCode,
    city: opportunity.city,
    country: opportunity.country,
    capacity: opportunity.venueCapacity ?? null,
    confidence: opportunity.venueConfidence ?? null,
    website: opportunity.venueWebsite,
    contact: opportunity.contact ?? null,
    contacts: opportunity.contacts,
    sourceUrl: opportunity.sourceUrls?.[0],
    sourceUrls: opportunity.sourceUrls ?? [],
    venueType: opportunity.venueType ?? null,
  };
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
    // Venue-specific facts (name, type, website, address, capacity) live in
    // the dedicated Venue section below instead of here (issue #213), so
    // event information stays about the event itself.
    rows = [
      { label: "Date", value: formatOpportunityDate(opportunity.date) },
      { label: "Time", value: opportunity.time },
      { label: "Deadline", value: opportunity.deadline },
      { label: "Location", value: location },
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

// A venue-type opportunity IS the venue, not an event, so its facts card
// must never be labeled "Event information" (reported bug).
export const INFO_SECTION_TITLES: Record<OpportunityCardFamily, string> = {
  event: "Event information",
  venue: "Venue information",
  organization: "Organization information",
};

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
  if (signal.kind === "venue_contact") return null;

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
  const completenessLabel = getLineupCompletenessLabel(opportunity);

  return (
    <div className={cardClassName}>
      <SectionTitle>Line-up</SectionTitle>
      {completenessLabel && <p className="text-xs text-foreground-muted mb-2.5">{completenessLabel}</p>}
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

// The venue as its own reusable entity, distinct from the event (issue
// #213). Only renders for a live-event opportunity (concert/festival/
// opening_slot) that resolved a venueId — a venue-type opportunity already
// presents itself as the venue in the Event information card above, so
// rendering this too would just duplicate it. Missing fields are omitted
// individually rather than hiding the whole section.
function VenueSection({ opportunity, venueInfo }: { opportunity: Opportunity; venueInfo?: VenueInfo | null }) {
  const canonicalVenueId = opportunity.venueId ?? opportunity.venueOpportunityId;
  if (!isLiveEventOpportunity(opportunity) || !canonicalVenueId || !opportunity.venue) return null;

  const venueName = venueInfo?.name ?? opportunity.venue;
  const venueImageUrl = venueInfo?.imageUrl ?? opportunity.venueImageUrl;
  const venueTypeLabel = venueInfo?.venueTypeLabel ?? getVenueTypeLabel(opportunity);
  const venueAddress = venueInfo?.address ?? opportunity.address;
  const venueCity = venueInfo?.city ?? opportunity.city;
  const venueCountry = venueInfo?.country ?? opportunity.country;
  const venueCapacity = venueInfo?.capacity ?? opportunity.venueCapacity;
  const venueConfidence = venueInfo?.confidence ?? opportunity.venueConfidence;
  const venueWebsite = venueInfo?.website ?? opportunity.venueWebsite;
  const location = [venueCity, venueCountry].filter(Boolean).join(", ");
  const bookingContactAction = venueInfo?.contact
    ? getContactActionForValue(venueInfo.contact)
    : getContactAction(opportunity);

  return (
    <div className={cardClassName}>
      <SectionTitle>Venue</SectionTitle>
      <div className="flex items-start gap-3">
        <Link href={`/venues/${canonicalVenueId}`} className="flex-shrink-0">
          <OpportunityImage src={venueImageUrl} alt={venueName} variant="thumbnail" className="w-11 h-11" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/venues/${canonicalVenueId}`}
            className="text-sm font-semibold text-foreground hover:text-accent-text transition-colors"
          >
            {venueName}
          </Link>
          <div className="flex flex-col gap-1.5 mt-2">
            <InfoRow label="Type" value={venueTypeLabel} />
            <InfoRow label="Address" value={venueAddress} />
            <InfoRow label="Location" value={location || null} />
            <InfoRow
              label="Capacity"
              value={venueCapacity != null ? `~${venueCapacity.toLocaleString()}` : null}
            />
            <InfoRow
              label="Confidence"
              value={venueConfidence != null ? `${venueConfidence}/100` : null}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {venueWebsite && (
              <a
                href={venueWebsite}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent-text hover:text-foreground transition-colors"
              >
                Official website ↗
              </a>
            )}
            {bookingContactAction && (
              <a
                href={bookingContactAction.href}
                target={bookingContactAction.href.startsWith("http") ? "_blank" : undefined}
                rel={bookingContactAction.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="text-xs text-accent-text hover:text-foreground transition-colors"
              >
                Booking contact
              </a>
            )}
            <Link
              href={`/venues/${canonicalVenueId}`}
              className="text-xs text-accent-text hover:text-foreground transition-colors"
            >
              View venue details →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function VenueOpportunityInformationSection({
  enrichment,
  isLoading,
  error,
  onRetry,
}: {
  enrichment?: VenueEnrichment;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const officialLink = getOfficialVenueLink(enrichment, enrichment?.website ?? null);
  const secondaryWebsite = enrichment?.website && enrichment.website !== officialLink?.url ? enrichment.website : null;
  const address = enrichment?.address;
  const city = enrichment?.city;
  const country = enrichment?.country;
  const capacity = enrichment?.capacity;
  const location = [city, country].filter(Boolean).join(", ");
  const socialLinks = uniqueStrings([enrichment?.facebook, enrichment?.instagram, ...(enrichment?.otherSocialLinks ?? [])]);
  const primaryLink = officialLink ?? (socialLinks[0]
    ? { label: socialLinks[0].includes("facebook") ? "Facebook" : socialLinks[0].includes("instagram") ? "Instagram" : "Official page", organization: null, url: socialLinks[0] }
    : null);
  const secondaryLinks = uniqueStrings([secondaryWebsite, ...socialLinks]).filter((url) => url !== primaryLink?.url);
  if (isLoading) return <VenueEnrichmentSkeleton />;
  if (error) {
    return (
      <div className={cardClassName}>
        <SectionTitle>Venue information</SectionTitle>
        <p className="text-sm text-warning-text">Venue enrichment failed.</p>
        <p className="text-xs text-foreground-muted mt-1 break-words">{error.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 text-xs font-medium text-accent-text hover:text-foreground border border-border-subtle px-3 py-1.5 rounded-lg transition-all"
        >
          Retry enrichment
        </button>
      </div>
    );
  }

  return (
    <div className={cardClassName}>
      <SectionTitle>Venue information</SectionTitle>
      {enrichment?.description && (
        <p className="text-sm text-foreground-secondary leading-relaxed mb-3">{enrichment.description}</p>
      )}
      <div className="flex flex-col gap-1.5">
        <InfoRow label="Type" value={enrichment?.type} />
        <InfoRow label="Address" value={address} />
        <InfoRow label="Location" value={location || null} />
        <InfoRow label="Website" value={enrichment?.website ?? primaryLink?.url} />
        <InfoRow label="Capacity" value={capacity != null ? `~${capacity.toLocaleString()}` : null} />
      </div>
      {(enrichment?.programsLiveMusic != null || enrichment?.booksEmergingArtists != null) && (
        <div className="flex flex-col gap-1 mt-3 text-sm text-foreground-secondary">
          {enrichment.programsLiveMusic != null && (
            <p>Live music programming: {enrichment.programsLiveMusic ? "Yes" : "No"}</p>
          )}
          {enrichment.booksEmergingArtists != null && (
            <p>Books emerging artists: {enrichment.booksEmergingArtists ? "Yes" : "No"}</p>
          )}
        </div>
      )}
      {enrichment?.genres && enrichment.genres.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {enrichment.genres.map((genre) => (
            <span key={genre} className="text-xs text-foreground-secondary bg-white/5 border border-border-subtle px-2 py-1 rounded-md">
              {genre}
            </span>
          ))}
        </div>
      )}
      {primaryLink && (
        <div className="mt-3">
          {primaryLink.organization && (
            <p className="text-xs text-foreground-muted mb-2">{primaryLink.organization}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {secondaryLinks.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-xs font-medium text-accent-text hover:text-foreground border border-border-subtle hover:border-border-accent-hover hover:bg-accent-tint px-3 py-1.5 rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:shadow-focus"
              >
                {socialLinkLabel(url)} ↗
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Contacts grouped by purpose, each labeled with its trust source and
// verification state — never an invented or inferred contact (issue #132
// review feedback). If no public contact was found, the section says so
// explicitly instead of falling back to generic outreach advice.
function ContactSection({
  opportunity,
  enrichment,
  isEnrichmentLoading = false,
  enrichmentError,
}: {
  opportunity: Opportunity;
  enrichment?: VenueEnrichment;
  isEnrichmentLoading?: boolean;
  enrichmentError?: Error | null;
}) {
  if (isEnrichmentLoading) {
    return (
      <div className={cardClassName}>
        <SectionTitle>Contact</SectionTitle>
        <div className="animate-pulse space-y-2">
          <div className="h-3 w-28 rounded bg-white/10" />
          <div className="h-3 w-52 rounded bg-white/10" />
          <div className="h-3 w-40 rounded bg-white/10" />
        </div>
      </div>
    );
  }
  if (enrichmentError) {
    return (
      <div className={cardClassName}>
        <SectionTitle>Contact</SectionTitle>
        <p className="text-sm text-foreground-muted">Contact enrichment unavailable because the venue lookup failed.</p>
      </div>
    );
  }

  const enrichedContacts = [
    enrichment?.bookingEmail
      ? { purpose: "booking" as const, label: "Booking", value: enrichment.bookingEmail, source: "Venue enrichment" }
      : null,
    enrichment?.contactEmail
      ? { purpose: "general" as const, label: "General", value: enrichment.contactEmail, source: "Venue enrichment" }
      : null,
    enrichment?.bookingContactName
      ? { purpose: "booking" as const, label: "Booking contact", value: enrichment.bookingContactName, source: "Venue enrichment" }
      : null,
    enrichment?.phone
      ? { purpose: "general" as const, label: "Phone", value: enrichment.phone, source: "Venue enrichment" }
      : null,
    enrichment?.programmingUrl
      ? { purpose: "booking" as const, label: "Programming", value: enrichment.programmingUrl, url: enrichment.programmingUrl, source: "Venue enrichment" }
      : null,
    enrichment?.contactUrl
      ? { purpose: "general" as const, label: "Contact page", value: enrichment.contactUrl, url: enrichment.contactUrl, source: "Venue enrichment" }
      : null,
  ]
    .filter((contact): contact is NonNullable<typeof contact> => contact !== null)
    .filter((contact, index, contacts) =>
      contacts.findIndex((candidate) => candidate.value === contact.value) === index
    );
  const enrichedOpportunity: Opportunity = {
    ...opportunity,
    contacts: [...(opportunity.contacts ?? []), ...enrichedContacts],
    contact: enrichment?.bookingEmail ?? enrichment?.contactEmail ?? enrichment?.contactUrl ?? opportunity.contact,
  };
  const groups = getGroupedContacts(enrichedOpportunity);
  const contactAction = getContactAction(enrichedOpportunity);
  const hasContact = groups.length > 0 || Boolean(contactAction);

  return (
    <div className={cardClassName}>
      <SectionTitle>Contact</SectionTitle>
      <div className="flex flex-col gap-3">
        {!hasContact && (
          <p className="text-sm text-foreground-secondary leading-relaxed">
            No public contact found yet.
          </p>
        )}
        {groups.map((group) => (
          <div key={group.purpose}>
            <p className="text-[10px] font-semibold text-foreground-muted uppercase tracking-wide mb-1">
              {group.label}
            </p>
            <ul className="flex flex-col gap-1.5">
              {group.contacts.map((contact) => (
                <li key={`${contact.purpose}-${contact.value}`} className="text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    {contact.url || isHttpUrl(contact.value) ? (
                      <a
                        href={contact.url ?? contact.value}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent-text hover:text-foreground transition-colors"
                      >
                        {contact.value}
                      </a>
                    ) : (
                      <span className="text-foreground-secondary">{contact.value}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {contactAction && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <a
              href={contactAction.href}
              target={contactAction.href.startsWith("http") ? "_blank" : undefined}
              rel={contactAction.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="text-xs font-medium text-accent-text hover:text-foreground border border-border-subtle hover:border-border-accent-hover hover:bg-accent-tint px-3 py-1.5 rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:shadow-focus"
            >
              {contactAction.label}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function DebugRawData({
  opportunity,
  enrichmentQuery,
}: {
  opportunity: Opportunity;
  enrichmentQuery: {
    data?: CachedVenueEnrichment;
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    error: Error | null;
  };
}) {
  const [copied, setCopied] = useState(false);
  const rawData = {
    opportunity,
    venueEnrichment: {
      status: enrichmentQuery.isLoading
        ? "loading"
        : enrichmentQuery.isError
          ? "error"
          : enrichmentQuery.data
            ? "success"
            : "not_requested",
      isFetching: enrichmentQuery.isFetching,
      cacheHit: enrichmentQuery.data?.cacheHit ?? null,
      enrichedAt: enrichmentQuery.data?.enrichedAt ?? null,
      enrichmentVersion: enrichmentQuery.data?.enrichmentVersion ?? null,
      error: enrichmentQuery.error?.message ?? null,
      data: enrichmentQuery.data?.enrichment ?? null,
    },
  };
  const serialized = JSON.stringify(rawData, null, 2);

  async function copyRawData() {
    await navigator.clipboard.writeText(serialized);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <details className={cardClassName}>
      <summary className="text-[10px] font-semibold text-foreground-muted uppercase tracking-widest cursor-pointer">
        Raw data (debug)
      </summary>
      <div className="flex justify-end mt-3">
        <button
          type="button"
          onClick={copyRawData}
          className="text-xs font-medium text-accent-text hover:text-foreground border border-border-subtle hover:border-border-accent-hover hover:bg-accent-tint px-3 py-1.5 rounded-lg transition-all"
        >
          {copied ? "Copied" : "Copy raw data"}
        </button>
      </div>
      <pre className="text-[11px] text-foreground-muted bg-background rounded-lg p-3 mt-2 overflow-x-auto">
        {serialized}
      </pre>
    </details>
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

function LinkedArtistText({ text, artists }: { text: string; artists: SimilarArtist[] }) {
  const matches = artists
    .filter((artist) => artist.name && text.toLocaleLowerCase().includes(artist.name.toLocaleLowerCase()))
    .sort((left, right) => right.name.length - left.name.length);
  if (matches.length === 0) return text;

  const pattern = new RegExp(
    `(${matches.map((artist) => artist.name.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi",
  );
  const artistsByName = new Map(matches.map((artist) => [artist.name.toLocaleLowerCase(), artist]));

  return text.split(pattern).map((part, index) => {
    const artist = artistsByName.get(part.toLocaleLowerCase());
    return artist ? (
      <Link
        key={`${artist.id}-${index}`}
        href={`/similar-artists/${artist.id}`}
        className="text-accent-text hover:text-foreground underline underline-offset-2 transition-colors"
      >
        {part}
      </Link>
    ) : part;
  });
}

function WhyItMatchesSection({
  factors,
  relatedArtists,
}: {
  factors: MatchFactor[];
  relatedArtists: SimilarArtist[];
}) {
  if (factors.length === 0) return null;

  return (
    <div className={cardClassName}>
      <SectionTitle>Why it matches</SectionTitle>
      <ul className="flex flex-col gap-2">
        {factors.map((factor) => (
          <li key={factor.code} className="flex items-start gap-2 text-sm">
            <span className="text-success-text flex-shrink-0" aria-hidden="true">✓</span>
            <span className="text-foreground-secondary">
              <LinkedArtistText text={factor.label} artists={relatedArtists} />
              {factor.detail && factor.detail !== factor.label && (
                <span className="block text-xs text-foreground-muted mt-0.5">
                  <LinkedArtistText text={factor.detail} artists={relatedArtists} />
                </span>
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
  venueInfo,
}: OpportunityDetailProps) {
  const { debugUIVisible } = useProductFeatures();
  const formattedDate = formatOpportunityDate(opportunity.date);
  const title = getDisplayTitle(opportunity);
  const positiveFactors = getPositiveMatchFactors(opportunity);
  const negativeFactors = getNegativeMatchFactors(opportunity);
  const neutralFactors = getNeutralMatchFactors(opportunity);
  const eventInfoRows = buildEventInfoRows(opportunity).filter((row) => Boolean(row.value));
  const family = getCardFamily(opportunity);
  const venueForEnrichment = family === "venue" ? buildVenueInfoFromOpportunity(opportunity) : null;
  const venueEnrichmentQuery = useVenueEnrichment(venueForEnrichment);
  const venueEnrichment = venueEnrichmentQuery.data?.enrichment;
  const hasEnrichedContact = Boolean(
    venueEnrichment?.bookingEmail ||
    venueEnrichment?.contactEmail ||
    venueEnrichment?.contactUrl ||
    venueEnrichment?.phone,
  );
  const resolvedNeutralFactors = family !== "venue"
    ? neutralFactors
    : !venueEnrichmentQuery.data
      ? []
      : neutralFactors.filter((factor) => {
          if (factor.code === "capacity_fit" && venueEnrichment?.capacity != null) return false;
          if (factor.code === "contact_available" && hasEnrichedContact) return false;
          return true;
        });

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
              {formattedDate && <span> · {formattedDate}</span>}
              {opportunity.time && <span> · {opportunity.time}</span>}
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
            neutralFactors={resolvedNeutralFactors}
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

        {/* 3. Event/venue/organization information — a single consolidated
            section replacing the previous duplicated "Details"/"Event
            details" cards. Titled per family: a venue-type opportunity IS
            the venue, not an event, so its facts must never be labeled
            "Event information". */}
        {family !== "venue" && eventInfoRows.length > 0 && (
          <div className={family === "event" ? buildCardClassName("stat", "border-border-accent bg-accent-tint") : cardClassName}>
            <SectionTitle>{INFO_SECTION_TITLES[family]}</SectionTitle>
            <div className="flex flex-col gap-1.5">
              {eventInfoRows.map((row) => (
                <InfoRow key={row.label} label={row.label} value={row.value} />
              ))}
            </div>
          </div>
        )}

        {/* 4. Line-up. */}
        <LineupSection opportunity={opportunity} relatedArtists={relatedArtists} />

        {/* 4b. Support slot potential (concert opportunities only). */}
        <SupportSlotPotentialSection opportunity={opportunity} />

        {/* 4c. Venue section (issue #213): the venue as its own reusable
            entity, distinct from the event itself, linking to its canonical
            page. Only rendered once a venue was actually resolved. */}
        <VenueSection opportunity={opportunity} venueInfo={venueInfo} />
        {family === "venue" && (
          <VenueOpportunityInformationSection
            enrichment={venueEnrichment}
            isLoading={venueEnrichmentQuery.isLoading}
            error={venueEnrichmentQuery.error}
            onRetry={() => void venueEnrichmentQuery.refetch()}
          />
        )}

        {/* 5. Contact information. */}
        <ContactSection
          opportunity={opportunity}
          enrichment={family === "venue" ? venueEnrichment : undefined}
          isEnrichmentLoading={family === "venue" && venueEnrichmentQuery.isLoading}
          enrichmentError={family === "venue" ? venueEnrichmentQuery.error : null}
        />

        {/* 6. Match analysis: why it matches, things to consider, missing or
            unverified information. */}
        <WhyItMatchesSection factors={positiveFactors} relatedArtists={relatedArtists} />
        <MatchFactorSection title="Things to consider" factors={negativeFactors} tone="warning" />
        <MatchFactorSection title="Missing or unverified information" factors={resolvedNeutralFactors} tone="neutral" />

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

        {debugUIVisible && (
          <DebugRawData opportunity={opportunity} enrichmentQuery={venueEnrichmentQuery} />
        )}
      </div>
    </div>
  );
}
