import type { Ms, Point, ServiceArea, WeeklyWindow, Zone } from "./types.ts"

// Geographic eligibility is decided by operational eta, not raw distance: the same 4 km takes longer
// at 18:00 than at 11:00. These are synthetic estimates (straight line × road factor at an hourly
// urban speed); a routing api would replace `etaMinutes` without changing the callers.

export const TZ_OFFSET_MINUTES = -6 * 60 // mexico city

export function distanceKm(a: Point, b: Point): number {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const ROAD_FACTOR = 1.35
export const HANDLING_MINUTES = 5

export function roadKm(a: Point, b: Point): number {
  return Math.round(distanceKm(a, b) * ROAD_FACTOR * 10) / 10
}

export function localHour(at: Ms): number {
  return new Date(at + TZ_OFFSET_MINUTES * 60_000).getUTCHours()
}

export function localMinutes(at: Ms): number {
  const d = new Date(at + TZ_OFFSET_MINUTES * 60_000)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

export function localDay(at: Ms): number {
  return new Date(at + TZ_OFFSET_MINUTES * 60_000).getUTCDay()
}

export function hhmm(at: Ms): string {
  return new Date(at + TZ_OFFSET_MINUTES * 60_000).toISOString().slice(11, 16)
}

/** Urban speed by local hour: slower in the morning and evening rush. */
export function speedKmh(at: Ms): number {
  const h = localHour(at)
  if ((h >= 7 && h < 10) || (h >= 17 && h < 20)) return 14
  return 22
}

export function etaMinutes(a: Point, b: Point, at: Ms): number {
  return Math.ceil((roadKm(a, b) / speedKmh(at)) * 60) + HANDLING_MINUTES
}

export function inServiceArea(area: ServiceArea, p: Point): boolean {
  return distanceKm(area.center, p) <= area.radiusKm
}

export function zoneFor(area: ServiceArea, eta: number): Zone {
  if (eta <= area.zoneAMaxMinutes) return "a"
  if (eta <= area.zoneBMaxMinutes) return "b"
  return "c"
}

/** Is `at` inside a weekly window on that local day? */
export function inWeekly(w: WeeklyWindow, at: Ms): boolean {
  const m = localMinutes(at)
  return w.days.includes(localDay(at)) && m >= w.from && m <= w.to
}

/** Local midnight of the day containing `at`. */
export function localMidnight(at: Ms): Ms {
  const d = new Date(at + TZ_OFFSET_MINUTES * 60_000)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - TZ_OFFSET_MINUTES * 60_000
}

/** End of the weekly window on the local day of `at`, or null if closed that day. */
export function weeklyEnd(w: WeeklyWindow, at: Ms): Ms | null {
  return w.days.includes(localDay(at)) ? localMidnight(at) + w.to * 60_000 : null
}

export function weeklyStart(w: WeeklyWindow, at: Ms): Ms | null {
  return w.days.includes(localDay(at)) ? localMidnight(at) + w.from * 60_000 : null
}
