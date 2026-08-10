"use client";

import Link from "next/link";
import type { Opportunity } from "@/types";
import type { VenueInfo } from "@/lib/venue";
import type { VenueEnrichment } from "@/types/venueEnrichment";
import { formatOpportunityDate, getContactActionForValue, getDisplayTitle } from "@/lib/opportunity";
import { useVenueEnrichment } from "@/lib/useVenueEnrichment";
import OpportunityImage from "@/components/common/OpportunityImage";
import { cardClassName as buildCardClassName } from "@/components/ui/Card";

interface VenueDetailProps {
  venue: VenueInfo;
  events: Opportunity[];
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
// clickable link, never raw text (PR #218 review feedback).
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

function ContactInfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  const action = getContactActionForValue(value);
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-foreground-muted w-24 flex-shrink-0">{label}</span>
      {action ? (
        <a
          href={action.href}
          target={action.href.startsWith("http") ? "_blank" : undefined}
          rel={action.href.startsWith("http") ? "noopener noreferrer" : undefined}
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

function LinkRow({ label, url }: { label: string; url?: string | null }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs font-medium text-accent-text hover:text-foreground border border-border-subtle hover:border-border-accent-hover hover:bg-accent-tint px-3 py-1.5 rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:shadow-focus"
    >
      {label} ↗
    </a>
  );
}

export function VenueEnrichmentSkeleton() {
  return (
    <div className={`${cardClassName} overflow-hidden`}>
      <SectionTitle>Venue information</SectionTitle>
      <div className="animate-pulse">
        <div className="space-y-2.5">
          <div className="h-3 w-full rounded bg-white/10" />
          <div className="h-3 w-5/6 rounded bg-white/10" />
          <div className="h-3 w-2/3 rounded bg-white/10" />
        </div>
        <div className="mt-4 flex gap-2">
          <div className="h-7 w-28 rounded-lg bg-white/10" />
          <div className="h-7 w-24 rounded-lg bg-white/10" />
        </div>
      </div>
    </div>
  );
}

function VenueContactSkeleton() {
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

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

// Canonical venue page (issue #213): every event opportunity that resolves
// to the same venueId links here, so the venue reads as one reusable entity
// instead of being redescribed on each event.
export default function VenueDetail({ venue, events }: VenueDetailProps) {
  const enrichmentQuery = useVenueEnrichment(venue);
  const enrichment = enrichmentQuery.data?.enrichment;
  const venueName = enrichment?.officialName ?? venue.name;
  const location = [enrichment?.city, enrichment?.country].filter(Boolean).join(", ");
  const website = enrichment?.website ?? null;
  const address = enrichment?.address;
  const capacity = enrichment?.capacity;
  const venueType = enrichment?.type ?? venue.venueTypeLabel;
  const contactAction = getContactActionForValue(enrichment?.bookingEmail ?? enrichment?.contactEmail);
  const contactRows = [
    { label: "Booking", value: enrichment?.bookingEmail },
    { label: "Person", value: enrichment?.bookingContactName },
    { label: "General", value: enrichment?.contactEmail },
    { label: "Phone", value: enrichment?.phone },
  ].filter((row, index, rows) => row.value && rows.findIndex((candidate) => candidate.value === row.value) === index);
  const socialLinks = uniqueStrings([enrichment?.instagram, enrichment?.facebook, ...(enrichment?.otherSocialLinks ?? [])]);
  const officialLink = getOfficialVenueLink(enrichment, website);
  const secondaryWebsite = website && website !== officialLink?.url ? website : null;
  const primaryLink = officialLink ?? (socialLinks[0]
    ? { label: socialLabel(socialLinks[0]), organization: null, url: socialLinks[0] }
    : null);
  const secondaryLinks = uniqueStrings([secondaryWebsite, ...socialLinks]).filter((url) => url !== primaryLink?.url);

  return (
    <div className="max-w-3xl">
      <Link href="/booking" className="text-xs text-accent-text hover:text-foreground transition-colors">
        ← Back to Opportunities
      </Link>

      <div className="mt-4 flex items-start gap-3">
        <OpportunityImage src={venue.imageUrl} alt={venueName} variant="thumbnail" className="w-12 h-12" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">{venueName}</h1>
            {venueType && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md border text-info-text bg-info-tint border-info-tint whitespace-nowrap">
                {venueType}
              </span>
            )}
          </div>
          {location && <p className="text-sm text-foreground-muted mt-1">{location}</p>}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {enrichmentQuery.isLoading && <VenueEnrichmentSkeleton />}
        {enrichmentQuery.isError && (
          <div className={cardClassName}>
            <SectionTitle>Venue information</SectionTitle>
            <p className="text-sm text-warning-text">Venue enrichment failed.</p>
            <p className="text-xs text-foreground-muted mt-1 break-words">{enrichmentQuery.error.message}</p>
            <button
              type="button"
              onClick={() => void enrichmentQuery.refetch()}
              className="mt-3 text-xs font-medium text-accent-text hover:text-foreground border border-border-subtle px-3 py-1.5 rounded-lg transition-all"
            >
              Retry enrichment
            </button>
          </div>
        )}

        {!enrichmentQuery.isLoading && !enrichmentQuery.isError && <div className={cardClassName}>
          <SectionTitle>Venue information</SectionTitle>
          {enrichment?.description && (
            <p className="text-sm text-foreground-secondary leading-relaxed mb-3">{enrichment.description}</p>
          )}
          <div className="flex flex-col gap-1.5">
            <InfoRow label="Type" value={enrichment?.type} />
            <InfoRow label="Address" value={address} />
            <InfoRow label="Location" value={location || null} />
            <InfoRow label="Website" value={website ?? primaryLink?.url} />
            <InfoRow
              label="Capacity"
              value={capacity != null ? `~${capacity.toLocaleString()}` : null}
            />
          </div>
          {primaryLink && (
            <div className="mt-3">
              {primaryLink.organization && (
                <p className="text-xs text-foreground-muted mb-2">{primaryLink.organization}</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {secondaryLinks.map((url) => (
                  <LinkRow key={url} label={socialLinks.includes(url) ? socialLabel(url) : "Website"} url={url} />
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {contactAction && (
              <a
                href={contactAction.href}
                target={contactAction.href.startsWith("http") ? "_blank" : undefined}
                rel={contactAction.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="text-xs font-medium text-accent-text hover:text-foreground border border-border-subtle hover:border-border-accent-hover hover:bg-accent-tint px-3 py-1.5 rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:shadow-focus"
              >
                Booking contact
              </a>
            )}
          </div>
        </div>}

        {enrichmentQuery.isLoading && <VenueContactSkeleton />}
        {enrichmentQuery.isError && (
          <div className={cardClassName}>
            <SectionTitle>Contact</SectionTitle>
            <p className="text-sm text-foreground-muted">
              Contact enrichment unavailable because the venue lookup failed.
            </p>
          </div>
        )}
        {!enrichmentQuery.isLoading && !enrichmentQuery.isError && (contactRows.length > 0 || enrichment?.contactUrl) && (
          <div className={cardClassName}>
            <SectionTitle>Contact</SectionTitle>
            <div className="flex flex-col gap-1.5">
              {contactRows.map((row) => (
                <ContactInfoRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <LinkRow label="Programming" url={enrichment?.programmingUrl} />
              <LinkRow label="Contact page" url={enrichment?.contactUrl} />
            </div>
          </div>
        )}

        {hasProgrammingInfo(enrichment) && (
          <div className={cardClassName}>
            <SectionTitle>Programming</SectionTitle>
            {enrichment?.programsLiveMusic === true && (
              <p className="text-sm text-foreground-secondary mb-2">
                Programs live music.
              </p>
            )}
            {enrichment?.booksEmergingArtists === true && (
              <p className="text-sm text-foreground-secondary mb-2">
                Regularly appears to book emerging or independent artists.
              </p>
            )}
            {enrichment?.genres && enrichment.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {enrichment.genres.map((genre) => (
                  <span key={genre} className="text-xs text-foreground-secondary bg-white/5 border border-border-subtle px-2 py-1 rounded-md">
                    {genre}
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <LinkRow label="Programming" url={enrichment?.programmingUrl} />
            </div>
          </div>
        )}

        {events.length > 0 && (
          <div className={cardClassName}>
            <SectionTitle>Events at this venue</SectionTitle>
            <ul className="flex flex-col gap-2.5">
              {events.map((event) => (
                <li key={event.id}>
                  <Link
                    href={`/opportunities/${event.id}`}
                    className="flex items-center justify-between gap-2 text-sm text-foreground-secondary hover:text-foreground transition-colors"
                  >
                    <span className="min-w-0 truncate">{getDisplayTitle(event)}</span>
                    {formatOpportunityDate(event.date) && (
                      <span className="text-xs text-foreground-muted flex-shrink-0">
                        {formatOpportunityDate(event.date)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function hasProgrammingInfo(enrichment?: VenueEnrichment): boolean {
  return Boolean(
    enrichment?.programmingUrl ||
    enrichment?.programsLiveMusic === true ||
    enrichment?.booksEmergingArtists === true ||
    (enrichment?.genres?.length ?? 0) > 0,
  );
}

function socialLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("instagram")) return "Instagram";
    if (host.includes("facebook")) return "Facebook";
    return host;
  } catch {
    return "Social link";
  }
}

export function getOfficialVenueLink(enrichment: VenueEnrichment | undefined, fallbackWebsite: string | null) {
  const prefersDedicatedWebsite =
    enrichment?.officialUrlType === "venue" || enrichment?.officialUrlType === "operator";
  const url = prefersDedicatedWebsite
    ? fallbackWebsite ?? enrichment?.officialUrl
    : enrichment?.officialUrl ?? fallbackWebsite;
  if (!url) return null;
  const confidence = enrichment?.officialUrlConfidence ?? (fallbackWebsite ? 0.9 : null);
  const label = confidence != null && confidence < 0.8
    ? "Venue page"
    : enrichment?.officialUrlType === "municipality" || enrichment?.officialUrlType === "social"
      ? "Official page"
      : "Official website";
  const organization = enrichment?.officialUrlType === "municipality"
    ? enrichment.officialOrganizationName ?? "Municipality"
    : enrichment?.officialUrlType === "social"
      ? socialLabel(url)
      : enrichment?.officialOrganizationName ?? null;

  return { label, organization, url };
}
