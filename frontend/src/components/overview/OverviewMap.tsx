"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import { feature } from "topojson-client";
import countries from "world-atlas/countries-110m.json";
import type { OverviewEntity } from "./OverviewExperience";

const COLORS = { venue: "#60A5FA", festival: "#FB923C", slot: "#4ADE80", artist: "#C084FC" } as const;

interface Props {
  entities: OverviewEntity[];
  home?: { latitude: number; longitude: number };
  selectedId: string | null;
  hoveredId: string | null;
  selectionSource: "map" | "page";
  onSelect: (id: string, source: "map" | "page") => void;
}

export default function OverviewMap({ entities, home, selectedId, hoveredId, selectionSource, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const opportunitiesLayerRef = useRef<L.MarkerClusterGroup | null>(null);
  const artistsLayerRef = useRef<L.MarkerClusterGroup | null>(null);
  const readyRef = useRef(false);
  const latestRef = useRef({ entities, selectedId, hoveredId, onSelect });
  latestRef.current = { entities, selectedId, hoveredId, onSelect };

  useEffect(() => {
    const host = hostRef.current;
    if (!host || mapRef.current) return;
    const hostElement = host;
    const map = L.map(host, {
      zoomControl: false,
      attributionControl: true,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
      minZoom: 4,
      maxZoom: 9,
      worldCopyJump: false,
    });
    mapRef.current = map;
    L.control.zoom({ position: "topright" }).addTo(map);
    map.attributionControl.addAttribution("Géométrie : Natural Earth (domaine public)");
    const geometry = feature(countries as never, (countries as unknown as { objects: { countries: never } }).objects.countries);
    L.geoJSON(geometry as GeoJSON.GeoJsonObject, {
      pane: "tilePane",
      interactive: false,
      style: (item) => {
        const focused = item?.properties?.name === "France";
        return { fillColor: focused ? "#262436" : "#141320", fillOpacity: 1, color: focused ? "rgba(192,132,252,.42)" : "rgba(255,255,255,.08)", weight: focused ? 1.2 : .6 };
      },
    }).addTo(map);
    const createCluster = (family: "opportunity" | "artist") => L.markerClusterGroup({
      showCoverageOnHover: false,
      removeOutsideVisibleBounds: false,
      animate: false,
      iconCreateFunction: (cluster) => L.divIcon({
        className: "",
        html: `<div class="ns-map-cluster ns-map-cluster--${family}">${cluster.getChildCount()}</div>`,
        iconSize: family === "artist" ? [27, 27] : [34, 34],
        iconAnchor: family === "artist" ? [13.5, 13.5] : [17, 17]
      })
    });
    opportunitiesLayerRef.current = createCluster("opportunity").addTo(map);
    artistsLayerRef.current = createCluster("artist").addTo(map);
    if (home) {
      L.marker([home.latitude, home.longitude], { interactive: false, zIndexOffset: -500, icon: L.divIcon({ className: "", html: '<div class="ns-map-home-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(map);
    }

    function draw() {
      if (!readyRef.current || !opportunitiesLayerRef.current || !artistsLayerRef.current) return;
      opportunitiesLayerRef.current.clearLayers();
      artistsLayerRef.current.clearLayers();
      for (const entity of latestRef.current.entities) {
        if (!Number.isFinite(entity.latitude) || !Number.isFinite(entity.longitude)) continue;
        const artist = entity.kind === "artist";
        const size = artist ? 25 : 29;
        const active = entity.id === latestRef.current.selectedId ? " is-selected" : entity.id === latestRef.current.hoveredId ? " is-hovered" : "";
        const faceStyle = artist ? `background:transparent;border-color:${COLORS.artist};color:${COLORS.artist}` : `background:${COLORS[entity.kind]}`;
        const html = `<div class="ns-map-pin${active}" data-id="${entity.id}"><div class="ns-map-pin-dot" style="${faceStyle}">${artist ? entity.initials : entity.score}</div><div class="ns-map-label">${entity.label}</div></div>`;
        const marker = L.marker([entity.latitude!, entity.longitude!], { riseOnHover: true, zIndexOffset: artist ? 0 : 200, icon: L.divIcon({ className: "", html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }) })
          .on("click", () => latestRef.current.onSelect(entity.id, "map"));
        (artist ? artistsLayerRef.current : opportunitiesLayerRef.current)?.addLayer(marker);
      }
    }

    function boot() {
      if (readyRef.current || hostElement.clientWidth === 0 || hostElement.clientHeight === 0) return;
      readyRef.current = true;
      map.invalidateSize(false);
      const points = latestRef.current.entities
        .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
        .map((item) => [item.latitude!, item.longitude!] as [number, number]);
      if (home) points.push([home.latitude, home.longitude]);
      if (points.length) map.fitBounds(points, { padding: [26, 26], maxZoom: 7, animate: false });
      else map.setView([46.6, 2.4], 5, { animate: false });
      draw();
    }
    let frame = 0;
    const retry = () => { boot(); if (!readyRef.current) frame = requestAnimationFrame(retry); };
    const observer = new ResizeObserver(() => { if (!readyRef.current) boot(); else map.invalidateSize(false); });
    const resize = () => { if (!readyRef.current) boot(); else map.invalidateSize(false); };
    const visible = () => { if (!readyRef.current) boot(); };
    observer.observe(hostElement);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", visible);
    map.on("zoomend moveend", draw);
    retry();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visible);
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
      opportunitiesLayerRef.current = null;
      artistsLayerRef.current = null;
    };
  }, [home]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const selected = entities.find((item) => item.id === selectedId);
    if (selected && selectionSource !== "map" && Number.isFinite(selected.latitude) && Number.isFinite(selected.longitude)) {
      map.setView([selected.latitude!, selected.longitude!], Math.max(map.getZoom(), 7), { animate: true, duration: .45 });
    }
    map.fire("moveend");
  }, [entities, hoveredId, selectedId, selectionSource]);

  return <div ref={hostRef} className="h-full w-full" aria-label="Carte interactive des opportunités et artistes similaires" />;
}
