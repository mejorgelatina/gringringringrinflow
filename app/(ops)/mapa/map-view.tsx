"use client";
import { useEffect, useRef, useState } from "react";
import type { MapPin } from "@/lib/map/points";

// Leaflet over OpenStreetMap tiles (E6): no keys, no paid provider. Loaded from a pinned CDN at
// runtime (the sandbox registry cannot install it); circle markers only, so no image assets are
// needed. Client-only: the page loads this with ssr disabled.

const LEAFLET_JS = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css";

type LatLng = [number, number];
type LeafletMap = {
  remove(): void;
  setView(c: LatLng, z: number): LeafletMap;
  fitBounds(b: unknown, o?: Record<string, unknown>): LeafletMap;
};
type LeafletLib = {
  map(el: HTMLElement, o?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, o?: Record<string, unknown>): { addTo(m: LeafletMap): void };
  circleMarker(c: LatLng, o?: Record<string, unknown>): { bindTooltip(s: string): unknown };
  layerGroup(l: unknown[]): { addTo(m: LeafletMap): void; remove(): void };
  latLngBounds(c: LatLng[]): { pad(n: number): unknown };
};

const KIND_COLOR: Record<MapPin["kind"], string> = { mine: "#368a62", pickup: "#2d7553", done: "#8b9690" };

function loadLeaflet(): Promise<LeafletLib> {
  const w = window as unknown as { L?: LeafletLib };
  if (w.L) return Promise.resolve(w.L);
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.onload = () => (window as unknown as { L?: LeafletLib }).L ? resolve((window as unknown as { L: LeafletLib }).L) : reject(new Error("leaflet missing"));
    script.onerror = () => reject(new Error("leaflet failed"));
    document.head.appendChild(script);
  });
}

export function MapView({ pins, center }: { pins: MapPin[]; center: { lat: number; lng: number } }) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const libRef = useRef<LeafletLib | null>(null);
  const layerRef = useRef<{ remove(): void } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!divRef.current) return;
    let alive = true;
    loadLeaflet().then(
      (L) => {
        if (!alive || !divRef.current) return;
        libRef.current = L;
        mapRef.current = L.map(divRef.current, { scrollWheelZoom: false }).setView([center.lat, center.lng], 13);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
        }).addTo(mapRef.current);
        setReady(true);
      },
      () => { if (alive) setFailed(true); },
    );
    return () => {
      alive = false;
      layerRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const L = libRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    layerRef.current?.remove();
    const layer = L.layerGroup(
      pins.map((p) =>
        L.circleMarker([p.point.lat, p.point.lng], {
          radius: 9, color: KIND_COLOR[p.kind], weight: 3, fillColor: KIND_COLOR[p.kind], fillOpacity: 0.25,
        }).bindTooltip(`<strong>${escapeHtml(p.title)}</strong><br/>${escapeHtml(p.detail)}`),
      ),
    );
    layer.addTo(map);
    layerRef.current = layer;
    if (pins.length > 0) {
      map.fitBounds(L.latLngBounds(pins.map((p) => [p.point.lat, p.point.lng] as LatLng)).pad(0.25), { maxZoom: 15 });
    } else {
      map.setView([center.lat, center.lng], 13);
    }
  }, [ready, pins, center]);

  if (failed) return <p className="empty">el mapa necesita conexión para cargar (openstreetmap). revisa tu red y recarga.</p>;
  return <div ref={divRef} style={{ height: 380, width: "100%", borderRadius: 12, zIndex: 0, background: "#eef1ec" }} />;
}

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
