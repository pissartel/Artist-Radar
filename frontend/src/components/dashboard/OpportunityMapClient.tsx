"use client";

import L from "leaflet";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import type { Opportunity } from "@/types";
import {
  MAP_MARKER_ICONS,
  markerIconHtml,
  opportunityMarkerColor,
  opportunityMarkerKind,
} from "@/lib/mapMarkerStyle";

export default function OpportunityMapClient({ opportunity }: { opportunity: Opportunity }) {
  const latitude = opportunity.latitude as number;
  const longitude = opportunity.longitude as number;
  const approximate = opportunity.locationPrecision === "approximate";
  const kind = opportunityMarkerKind(opportunity.type);
  const color = opportunityMarkerColor(opportunity.type);
  const icon = L.divIcon({
    className: "ecosystem-marker-wrap",
    html: markerIconHtml(kind, color, approximate),
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
  const mapsUrl = `https://www.openstreetmap.org/?mlat=${latitude.toFixed(6)}&mlon=${longitude.toFixed(6)}#map=${approximate ? 11 : 16}/${latitude.toFixed(6)}/${longitude.toFixed(6)}`;

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated" aria-label={`Location map for ${opportunity.title}`}>
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="ecosystem-key-icon"
            style={{ color }}
            dangerouslySetInnerHTML={{ __html: MAP_MARKER_ICONS[kind] }}
          />
          <div>
            <p className="text-xs font-medium text-foreground-secondary">Location map</p>
            <p className={`text-[10px] ${approximate ? "text-warning-text" : "text-success-text"}`}>
              {approximate ? "Approximate location · city centre" : "Exact address location"}
            </p>
          </div>
        </div>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-accent-text hover:text-foreground transition-colors">
          Open in Maps ↗
        </a>
      </div>
      <MapContainer center={[latitude, longitude]} zoom={approximate ? 11 : 15} scrollWheelZoom={false} className="h-48 w-full" aria-label={`Interactive map of ${opportunity.title}`}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[latitude, longitude]} icon={icon} title={opportunity.title} />
      </MapContainer>
    </section>
  );
}
