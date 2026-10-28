import type { Point, TimeWindow } from "./types.ts"

export function distanceKm(a: Point, b: Point): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Straight-line distance at an urban average speed. An estimate, not a verified route.
export const URBAN_KMH = 20

export function travelMinutes(km: number): number {
  return Math.ceil((km / URBAN_KMH) * 60)
}

export function overlap(a: TimeWindow, b: TimeWindow): TimeWindow | null {
  const start = Math.max(Date.parse(a.start), Date.parse(b.start))
  const end = Math.min(Date.parse(a.end), Date.parse(b.end))
  if (!(start < end)) return null
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() }
}
