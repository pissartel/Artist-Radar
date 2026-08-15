import type { Opportunity } from "@/types";

interface OpportunityMapProps {
  opportunity: Opportunity;
}

function coordinate(value: number): string {
  return value.toFixed(6);
}

export default function OpportunityMap({ opportunity }: OpportunityMapProps) {
  const { latitude, longitude } = opportunity;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const lat = latitude as number;
  const lon = longitude as number;
  const approximate = opportunity.locationPrecision === "approximate";
  const delta = approximate ? 0.08 : 0.015;
  const bbox = [lon - delta, lat - delta, lon + delta, lat + delta].map(coordinate).join(",");
  const marker = `${coordinate(lat)},${coordinate(lon)}`;
  const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&marker=${encodeURIComponent(marker)}&layer=mapnik`;
  const mapsUrl = `https://www.openstreetmap.org/?mlat=${coordinate(lat)}&mlon=${coordinate(lon)}#map=${approximate ? 11 : 16}/${coordinate(lat)}/${coordinate(lon)}`;

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div>
          <p className="text-xs font-medium text-foreground-secondary">Location map</p>
          <p className={`text-[10px] ${approximate ? "text-warning-text" : "text-success-text"}`}>
            {approximate ? "Approximate location · city centre" : "Exact address location"}
          </p>
        </div>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-accent-text hover:text-foreground transition-colors"
        >
          Open in Maps ↗
        </a>
      </div>
      <iframe
        title={`Map of ${opportunity.title}`}
        src={embedUrl}
        className="h-48 w-full border-0"
        loading="lazy"
      />
      <p className="px-3 py-1.5 text-[9px] text-foreground-muted">
        © <a className="underline hover:text-foreground" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>
      </p>
    </div>
  );
}
