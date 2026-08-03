"use client";

import Link from "next/link";
import type { Opportunity } from "@/types";
import type { VenueInfo } from "@/lib/venue";
import { formatOpportunityDate, getContactActionForValue, getDisplayTitle } from "@/lib/opportunity";
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

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-foreground-muted w-24 flex-shrink-0">{label}</span>
      <span className="text-foreground-secondary">{value}</span>
    </div>
  );
}

// Canonical venue page (issue #213): every event opportunity that resolves
// to the same venueId links here, so the venue reads as one reusable entity
// instead of being redescribed on each event.
export default function VenueDetail({ venue, events }: VenueDetailProps) {
  const location = [venue.city, venue.country].filter(Boolean).join(", ");
  const contactAction = getContactActionForValue(venue.contact);

  return (
    <div className="max-w-3xl">
      <Link href="/booking" className="text-xs text-accent-text hover:text-foreground transition-colors">
        ← Back to Opportunities
      </Link>

      <div className="mt-4 flex items-start gap-3">
        <OpportunityImage src={venue.imageUrl} alt={venue.name} variant="thumbnail" className="w-12 h-12" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">{venue.name}</h1>
            {venue.venueTypeLabel && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md border text-info-text bg-info-tint border-info-tint whitespace-nowrap">
                {venue.venueTypeLabel}
              </span>
            )}
          </div>
          {location && <p className="text-sm text-foreground-muted mt-1">{location}</p>}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <div className={cardClassName}>
          <SectionTitle>Venue information</SectionTitle>
          <div className="flex flex-col gap-1.5">
            <InfoRow label="Address" value={venue.address} />
            <InfoRow label="City" value={venue.city} />
            <InfoRow label="Country" value={venue.country} />
            <InfoRow
              label="Capacity"
              value={venue.capacity != null ? `~${venue.capacity.toLocaleString()}` : null}
            />
            <InfoRow label="Confidence" value={venue.confidence != null ? `${venue.confidence}/100` : null} />
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {venue.website && (
              <a
                href={venue.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-accent-text hover:text-foreground border border-border-subtle hover:border-border-accent-hover hover:bg-accent-tint px-3 py-1.5 rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:shadow-focus"
              >
                Official website ↗
              </a>
            )}
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
        </div>

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
