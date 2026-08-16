"use client";

import { useEffect, useMemo, useState } from "react";
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

const CACHE_KEY = "artist-radar:geocodes:v1";
const TYPE_COLORS: Record<OpportunityType, string> = {
  venue: "#3b82f6", concert: "#f97316", opening_slot: "#f43f5e",
  festival: "#eab308", organization: "#22c55e", label: "#14b8a6",
};

function readCache(): Record<string, GeocodedLocation> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}"); } catch { return {}; }
}

function toResolved(location: NormalizedLocation | undefined, cache: Record<string, GeocodedLocation>): GeocodedLocation | undefined {
  if (!location) return undefined;
  if (hasCoordinates(location)) return location;
  return cache[locationCacheKey(location)];
}

function MapLayers({ entities, center }: { entities: MapEntity[]; center?: GeocodedLocation }) {
  const map = useMap();
  useEffect(() => {
    if (center?.boundingBox?.length === 4) {
      map.fitBounds([[center.boundingBox[0], center.boundingBox[2]], [center.boundingBox[1], center.boundingBox[3]]], { padding: [20, 20] });
    } else if (center) map.setView([center.latitude, center.longitude], center.precision === "country" ? 5 : 9);
  }, [center, map]);

  useEffect(() => {
    const clusters = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48, spiderfyOnMaxZoom: true });
    for (const entity of entities) {
      const approximate = entity.location.precision === "country";
      const color = entity.kind === "artist" ? "#c084fc" : TYPE_COLORS[entity.type ?? "organization"];
      const icon = L.divIcon({
        className: "ecosystem-marker-wrap",
        html: `<span class="ecosystem-marker ${entity.kind === "artist" ? "ecosystem-marker-artist" : ""} ${approximate ? "ecosystem-marker-approximate" : ""}" style="--marker-color:${color}" aria-hidden="true"></span>`,
        iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -12],
      });
      const marker = L.marker([entity.location.latitude, entity.location.longitude], { icon, title: entity.title });
      const node = document.createElement("div");
      node.className = "ecosystem-popup";
      const title = document.createElement("strong"); title.textContent = entity.title; node.append(title);
      const subtitle = document.createElement("p"); subtitle.textContent = entity.subtitle; node.append(subtitle);
      if (approximate) { const note = document.createElement("small"); note.textContent = "Approximate country-level location"; node.append(note); }
      const link = document.createElement("a"); link.href = entity.detailHref; link.textContent = "View details →"; node.append(link);
      marker.bindPopup(node, { maxWidth: 260 });
      clusters.addLayer(marker);
    }
    map.addLayer(clusters);
    return () => { map.removeLayer(clusters); };
  }, [entities, map]);
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
  const [showOpportunities, setShowOpportunities] = useState(true);
  const [showArtists, setShowArtists] = useState(true);
  const [type, setType] = useState<"all" | OpportunityType>("all");
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
    if (showOpportunities) for (const item of opportunities) {
      if (type !== "all" && item.type !== type) continue;
      const location = toResolved(item.normalizedLocation, cache); if (!location) continue;
      visible.push({ id: `opportunity-${item.id}`, kind: "opportunity", title: item.title, subtitle: `${item.type.replace("_", " ")} · ${item.matchScore}% match · ${item.location}`, detailHref: `/opportunities/${item.id}`, type: item.type, score: item.matchScore, location });
    }
    return visible;
  }, [cache, opportunities, showArtists, showOpportunities, similarArtists, type]);
  const types = [...new Set(opportunities.map((item) => item.type))];

  return <section className="mb-8" aria-labelledby="ecosystem-map-title">
    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 id="ecosystem-map-title" className="text-sm font-semibold uppercase tracking-widest text-foreground">Geographic ecosystem</h2><p className="mt-1 text-xs text-foreground-muted">Similar artists and booking opportunities around your scene.</p></div>
      <div className="flex flex-wrap items-center gap-2" aria-label="Map filters">
        <button type="button" aria-pressed={showOpportunities} onClick={() => setShowOpportunities((value) => !value)} className={`rounded-full border px-3 py-1.5 text-xs ${showOpportunities ? "border-primary bg-accent-tint text-accent-text" : "border-border text-foreground-muted"}`}>Opportunities</button>
        <button type="button" aria-pressed={showArtists} onClick={() => setShowArtists((value) => !value)} className={`rounded-full border px-3 py-1.5 text-xs ${showArtists ? "border-primary bg-accent-tint text-accent-text" : "border-border text-foreground-muted"}`}>Similar artists</button>
        <label className="sr-only" htmlFor="map-opportunity-type">Opportunity type</label>
        <select id="map-opportunity-type" value={type} onChange={(event) => setType(event.target.value as "all" | OpportunityType)} disabled={!showOpportunities} className="rounded-lg border border-input-border bg-input-background px-3 py-1.5 text-xs text-foreground disabled:opacity-50">
          <option value="all">All opportunity types</option>{types.map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}
        </select>
      </div>
    </div>
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      {center ? <MapContainer center={[center.latitude, center.longitude]} zoom={center.precision === "country" ? 5 : 9} scrollWheelZoom className="h-[430px] min-h-[60vh] w-full sm:min-h-0 sm:h-[520px]" aria-label="Interactive map of opportunities and similar artists">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapLayers entities={entities} center={center} />
      </MapContainer> : <div className="flex h-[430px] items-center justify-center px-6 text-center text-sm text-foreground-muted">{loading ? "Locating the artist ecosystem…" : "No reliable location is available for this map."}</div>}
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-xs text-foreground-muted" aria-label="Map legend">
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rotate-45 rounded-sm bg-accent-text" />Similar artist</span>
        {types.map((value) => <span key={value}><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TYPE_COLORS[value] }} />{value.replace("_", " ")}</span>)}
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border border-dashed border-foreground-muted" />Approximate</span>
        <span className="ml-auto">{entities.length} visible · markers cluster automatically</span>
      </div>
    </div>
    <p className="mt-2 text-[11px] text-foreground-disabled">Locations reflect source precision. Country-level points are approximate and are never presented as exact addresses.</p>
  </section>;
}
