import type { MissionItem } from "../offers/missions.ts";
import type { Offer } from "../offers/types.ts";
import type { Point, Tier, Zone } from "../network/types.ts";

// Map view-models (E6). Pins carry exact coordinates only where the viewer is entitled to them:
// the organization's own points, and pickup points of committed (scheduled+) missions. Eligible
// destinations travel as zone-coded labels, never as foreign coordinates.

export type MapPin = {
  id: string;
  point: Point;
  title: string;
  detail: string;
  kind: "mine" | "pickup" | "done";
};

export type ZoneBadge = { participantId: string; name: string; tier: Tier; zone: Zone; maxKg: number };

export const ZONE_COLOR: Record<Zone, string> = { a: "#2d7553", b: "#b98a1c", c: "#9a4b40" };
export const TIER_LABEL: Record<Tier, string> = { people: "personas", transformation: "transformación", compost: "composta" };

/** The donor's own pickup pins, one per lot with a known point. Eligible entries stay zone labels. */
export function donorPins(offers: Offer[]): { pins: MapPin[]; zones: Record<string, ZoneBadge[]> } {
  const pins: MapPin[] = [];
  const zones: Record<string, ZoneBadge[]> = {};
  for (const o of offers) {
    const point = o.case?.resource.location ?? null;
    if (point) {
      pins.push({
        id: o.id,
        point,
        title: o.item || o.category || "lote",
        detail: `${o.case?.resource.kg ?? 0} kg · ${o.status === "open" ? "abierta" : "en revisión"}`,
        kind: "mine",
      });
    }
    zones[o.id] = o.eligible.map((e) => ({ participantId: e.participantId, name: e.name, tier: e.tier, zone: e.zone, maxKg: e.maxKg }));
  }
  return { pins, zones };
}

/** Committed pickup pins for the holder: active and completed missions with a revealed point. */
export function missionPins(items: MissionItem[]): MapPin[] {
  const pins: MapPin[] = [];
  for (const { mission, item } of items) {
    if (mission.status === "expired" || !item) continue;
    const point = item.offer.case?.resource.location ?? null;
    if (!point) continue;
    const title = item.offer.item || item.offer.category || "lote";
    pins.push({
      id: mission.id,
      point,
      title,
      detail: mission.status === "completed"
        ? `recibidos ${mission.receivedKg} kg de ${item.offer.donorName}`
        : `${mission.kg} kg de ${item.offer.donorName} · recoger antes del ${new Date(mission.windowEnd).toLocaleString("es-mx", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
      kind: mission.status === "completed" ? "done" : "pickup",
    });
  }
  return pins;
}

/** Center of a set of pins, or the pilot fallback (roma norte) when there is nothing to show. */
export function pinsCenter(pins: MapPin[]): Point {
  if (pins.length === 0) return { lat: 19.4194, lng: -99.1617 };
  const lat = pins.reduce((s, p) => s + p.point.lat, 0) / pins.length;
  const lng = pins.reduce((s, p) => s + p.point.lng, 0) / pins.length;
  return { lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000 };
}
