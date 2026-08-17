"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import "leaflet.markercluster";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import type { NormalizedLocation, Opportunity, OpportunityType, SimilarArtist } from "@/types";
import { hasCoordinates, locationCacheKey, locationQuery, type GeocodedLocation } from "@/lib/mapLocation";
import type { EcosystemMapProps } from "./EcosystemMap";

type MapEntity = {
  id: string; kind: "artist" | "opportunity"; title: string; subtitle: string;
  detailHref: string; type?: OpportunityType; score?: number; location: GeocodedLocation;
};

type MarkerKind = "similar_artist" | OpportunityType | "fallback";

const CACHE_KEY = "artist-radar:geocodes:v1";
const SIMILAR_ARTIST_COLOR = "#c084fc";
const TYPE_COLORS: Record<OpportunityType, string> = {
  venue: "#3b82f6", concert: "#f97316", opening_slot: "#f43f5e",
  festival: "#eab308", organization: "#22c55e", label: "#14b8a6",
};
const TYPE_LABELS: Record<OpportunityType, string> = {
  venue: "Venues",
  concert: "Concerts",
  festival: "Festivals",
  opening_slot: "Opening Slots",
  organization: "Bookers / agencies / promoters",
  label: "Labels",
};

const MARKER_ICONS: Record<MarkerKind, string> = {
  similar_artist: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M3.5 18c.7-3.2 2.5-5 5.5-5s4.8 1.8 5.5 5"/><path d="M16 5v9.2a2.7 2.7 0 1 1-1.5-2.4V7l6-1.5v6.7a2.7 2.7 0 1 1-1.5-2.4V4.5z"/></svg>',
  venue: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V7l8-4 8 4v14M8 21v-4h8v4M8 10h2m4 0h2M8 14h2m4 0h2"/></svg>',
  concert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v11"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="15" r="3"/></svg>',
  festival: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18L12 5zM8 20l4-15 4 15M5.5 16h13"/></svg>',
  opening_slot: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>',
  organization: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 12h18M10 12v2h4v-2"/></svg>',
  label: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3m0 12v3M3 12h3m12 0h3"/></svg>',
  fallback: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
};

function markerKind(entity: MapEntity): MarkerKind {
  if (entity.kind === "artist") return "similar_artist";
  return entity.type && entity.type in MARKER_ICONS ? entity.type : "fallback";
}

function mapIcon(kind: MarkerKind, className: string): JSX.Element {
  return <span className={className} dangerouslySetInnerHTML={{ __html: MARKER_ICONS[kind] }} />;
}

function readCache(): Record<string, GeocodedLocation> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}"); } catch { return {}; }
}

function toResolved(location: NormalizedLocation | undefined, cache: Record<string, GeocodedLocation>): GeocodedLocation | undefined {
  if (!location) return undefined;
  if (hasCoordinates(location)) return location;
  return cache[locationCacheKey(location)];
}

function MapLayers({ entities, center, onNavigate }: { entities: MapEntity[]; center?: GeocodedLocation; onNavigate: (href: string) => void }) {
  const map = useMap();
  useEffect(() => {
    if (center?.boundingBox?.length === 4) {
      map.fitBounds([[center.boundingBox[0], center.boundingBox[2]], [center.boundingBox[1], center.boundingBox[3]]], {
        padding: [20, 20],
        maxZoom: center.precision === "country" ? 6 : 9,
      });
    } else if (center) map.setView([center.latitude, center.longitude], center.precision === "country" ? 5 : 9);
  }, [center, map]);

  useEffect(() => {
    const clusters = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48, spiderfyOnMaxZoom: true });
    for (const entity of entities) {
      const approximate = entity.location.precision === "country";
      const color = entity.kind === "artist" ? SIMILAR_ARTIST_COLOR : TYPE_COLORS[entity.type ?? "organization"];
      const kind = markerKind(entity);
      const icon = L.divIcon({
        className: "ecosystem-marker-wrap",
        html: `<span class="ecosystem-marker ${approximate ? "ecosystem-marker-approximate" : ""}" style="--marker-color:${color}" aria-hidden="true">${MARKER_ICONS[kind]}</span>`,
        iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -14],
      });
      const marker = L.marker([entity.location.latitude, entity.location.longitude], { icon, title: entity.title });
      const node = document.createElement("div");
      node.className = "ecosystem-popup";
      const title = document.createElement("strong"); title.textContent = entity.title; node.append(title);
      const subtitle = document.createElement("p"); subtitle.textContent = entity.subtitle; node.append(subtitle);
      if (approximate) { const note = document.createElement("small"); note.textContent = "Approximate country-level location"; node.append(note); }
      const link = document.createElement("button"); link.type = "button"; link.textContent = "View details →";
      link.addEventListener("click", () => onNavigate(entity.detailHref)); node.append(link);
      marker.bindPopup(node, { maxWidth: 260 });
      clusters.addLayer(marker);
    }
    map.addLayer(clusters);
    return () => { map.removeLayer(clusters); };
  }, [entities, map, onNavigate]);
  return null;
}

function viewportLocation(artist: EcosystemMapProps["artist"]): NormalizedLocation | undefined {
  if (artist.country) return { country: artist.country, precision: "country" };
  return artist.normalizedLocation;
}

function collectLocations(artist: EcosystemMapProps["artist"], opportunities: Opportunity[], similarArtists: SimilarArtist[]) {
  return [viewportLocation(artist), ...opportunities.map((item) => item.normalizedLocation), ...similarArtists.map((item) => item.normalizedLocation)]
    .filter((location): location is NormalizedLocation => Boolean(location));
}

export default function EcosystemMapClient({ artist, opportunities, similarArtists }: EcosystemMapProps) {
  const router = useRouter();
  const navigateToDetail = useCallback((href: string) => router.push(href), [router]);
  const [showArtists, setShowArtists] = useState(true);
  const [visibleTypes, setVisibleTypes] = useState<Set<OpportunityType>>(
    () => new Set(opportunities.map((item) => item.type)),
  );
  const [cache, setCache] = useState<Record<string, GeocodedLocation>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = readCache();
    const locations = collectLocations(artist, opportunities, similarArtists);
    const missing = [...new Map(locations.filter((location) => !hasCoordinates(location) && !stored[locationCacheKey(location)])
      .map((location) => [locationCacheKey(location), location])).values()];
    if (missing.length === 0) { setCache(stored); setLoading(false); return; }
    fetch("/api/geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queries: missing.map(locationQuery) }) })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then(({ results }: { results: Record<string, Omit<GeocodedLocation, "precision"> | null> }) => {
        const next = { ...stored };
        for (const location of missing) {
          const result = results[locationQuery(location).toLocaleLowerCase()];
          if (result) next[locationCacheKey(location)] = { ...location, ...result };
        }
        localStorage.setItem(CACHE_KEY, JSON.stringify(next));
        setCache(next);
      }).catch(() => setCache(stored)).finally(() => setLoading(false));
  }, [artist, opportunities, similarArtists]);

  // Country deliberately wins over city for the initial viewport. City (or
  // the onboarding geography mapped onto it) is only the fallback.
  const center = toResolved(viewportLocation(artist), cache);
  const entities = useMemo(() => {
    const visible: MapEntity[] = [];
    if (showArtists) for (const item of similarArtists) {
      const location = toResolved(item.normalizedLocation, cache); if (!location) continue;
      visible.push({ id: `artist-${item.id}`, kind: "artist", title: item.name, subtitle: `${item.matchScore}% overall relevance · ${item.location || "Location available"}`, detailHref: `/similar-artists/${item.id}`, location });
    }
    for (const item of opportunities) {
      if (!visibleTypes.has(item.type)) continue;
      const location = toResolved(item.normalizedLocation, cache); if (!location) continue;
      visible.push({ id: `opportunity-${item.id}`, kind: "opportunity", title: item.title, subtitle: `${item.type.replace("_", " ")} · ${item.matchScore}% match · ${item.location}`, detailHref: `/opportunities/${item.id}`, type: item.type, score: item.matchScore, location });
    }
    return visible;
  }, [cache, opportunities, showArtists, similarArtists, visibleTypes]);
  const types = [...new Set(opportunities.map((item) => item.type))];
  const toggleType = (value: OpportunityType) => setVisibleTypes((current) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  });

  return <section className="mb-8" aria-label="Geographic ecosystem map">
    <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Map filters">
        <button type="button" aria-pressed={showArtists} onClick={() => setShowArtists((value) => !value)} style={showArtists ? { borderColor: SIMILAR_ARTIST_COLOR, color: SIMILAR_ARTIST_COLOR, backgroundColor: `${SIMILAR_ARTIST_COLOR}1a` } : undefined} className={`rounded-full border px-3 py-1.5 text-xs ${showArtists ? "" : "border-border text-foreground-muted"}`}>{mapIcon("similar_artist", "ecosystem-key-icon")}Similar Artists</button>
        {types.map((value) => {
          const active = visibleTypes.has(value);
          const color = TYPE_COLORS[value];
          return <button key={value} type="button" aria-pressed={active} onClick={() => toggleType(value)} style={active ? { borderColor: color, color, backgroundColor: `${color}1a` } : undefined} className={`rounded-full border px-3 py-1.5 text-xs ${active ? "" : "border-border text-foreground-muted"}`}>{mapIcon(value, "ecosystem-key-icon")}{TYPE_LABELS[value]}</button>;
        })}
      </div>
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      {center ? <MapContainer center={[center.latitude, center.longitude]} zoom={center.precision === "country" ? 5 : 9} scrollWheelZoom className="h-[430px] min-h-[60vh] w-full sm:min-h-0 sm:h-[520px]" aria-label="Interactive map of opportunities and similar artists">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapLayers entities={entities} center={center} onNavigate={navigateToDetail} />
      </MapContainer> : <div className="flex h-[430px] items-center justify-center px-6 text-center text-sm text-foreground-muted">{loading ? "Locating the artist ecosystem…" : "No reliable location is available for this map."}</div>}
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-xs text-foreground-muted" aria-label="Map legend">
        <span style={{ color: SIMILAR_ARTIST_COLOR }}>{mapIcon("similar_artist", "ecosystem-key-icon")}Similar Artist</span>
        {types.map((value) => <span key={value} style={{ color: TYPE_COLORS[value] }}>{mapIcon(value, "ecosystem-key-icon")}{TYPE_LABELS[value]}</span>)}
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border border-dashed border-foreground-muted" />Approximate</span>
        <span className="ml-auto">{entities.length} visible · markers cluster automatically</span>
      </div>
    </div>
    <p className="mt-2 text-[11px] text-foreground-disabled">Locations reflect source precision. Country-level points are approximate and are never presented as exact addresses.</p>
  </section>;
}
