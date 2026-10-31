import { availableKg } from "./coordinator.ts"
import { hhmm } from "./zones.ts"
import { TIERS, type NetworkCase, type Reservation, type Tier } from "./types.ts"

// Tracking (what is happening with each reservation) and outcome metrics (what was actually received).
// Impact counts only verified receipts, kept separate by route: kg fed to people, kg transformed and
// kg composted are different results and are never added into one number.

export type Stage = { key: string; label: string; done: boolean; at: string | null }

export function trackingStages(c: NetworkCase, r: Reservation): Stage[] {
  const at = (type: string) => {
    const e = c.events.find((x) => x.type === type && x.detail.reservation === r.id)
    return e ? hhmm(e.at) : null
  }
  const paid = r.quote && r.quote.mode !== "pickup"
  const stages: Stage[] = [
    { key: "published", label: "publicado", done: true, at: hhmm(c.publishedAt) },
    { key: "reserved", label: `apartado · ${r.kg} kg`, done: true, at: hhmm(r.createdAt) },
    { key: "delivery", label: r.quote ? (r.quote.mode === "pickup" ? "recoge el receptor · $0" : `${r.quote.mode === "courier" ? "envío cotizado" : "ruta existente"} · $${r.quote.costMxn}`) : "forma de entrega", done: !!r.quote, at: at("pickup_scheduled") ?? at("quote_presented") },
  ]
  if (paid) {
    stages.push({ key: "accepted", label: "costo aceptado por el receptor", done: r.quoteAcceptedAt !== null, at: at("quote_accepted") })
    stages.push({ key: "capacity", label: "capacidad confirmada por el operador", done: r.capacityConfirmedAt !== null, at: at("transport_confirmed") })
  }
  stages.push({ key: "picked_up", label: "recolectado con código", done: r.pickedUpAt !== null, at: at("picked_up") })
  stages.push({ key: "received", label: r.receivedKg !== null ? `recibido · ${r.receivedKg} kg` : "recepción confirmada", done: r.receivedAt !== null, at: at("received") })
  return stages
}

export type Metrics = {
  verifiedKg: Record<Tier, number>
  lots: number
  lotsWithDestination: number
  avgMinutesToFirstReservation: number | null
  reservations: number
  delivered: number
  expired: number
  stopped: number
  logisticsCostMxn: number
  /** Kg moved on spare room of trips that were already happening. */
  idleCapacityKg: number
  detourKm: number
  unallocatedKg: number
}

export function metrics(cases: NetworkCase[]): Metrics {
  const verifiedKg = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<Tier, number>
  const all = cases.flatMap((c) => c.reservations)
  for (const r of all) if (r.status === "delivered") verifiedKg[r.tier] = Math.round((verifiedKg[r.tier] + (r.receivedKg ?? 0)) * 10) / 10
  const firsts = cases.filter((c) => c.reservations.length).map((c) => (Math.min(...c.reservations.map((r) => r.createdAt)) - c.publishedAt) / 60_000)
  const confirmed = all.filter((r) => r.quote && (r.quote.mode === "pickup" || r.capacityConfirmedAt !== null) && !["cancelled", "expired"].includes(r.status))
  return {
    verifiedKg,
    lots: cases.length,
    lotsWithDestination: cases.filter((c) => c.reservations.some((r) => r.status === "delivered")).length,
    avgMinutesToFirstReservation: firsts.length ? Math.round(firsts.reduce((a, b) => a + b, 0) / firsts.length) : null,
    reservations: all.length,
    delivered: all.filter((r) => r.status === "delivered").length,
    expired: all.filter((r) => r.status === "expired").length,
    stopped: all.filter((r) => r.status === "stopped").length,
    logisticsCostMxn: confirmed.reduce((s, r) => s + (r.quote?.costMxn ?? 0), 0),
    idleCapacityKg: confirmed.filter((r) => r.quote?.mode === "backhaul").reduce((s, r) => s + r.kg, 0),
    detourKm: Math.round(confirmed.reduce((s, r) => s + (r.quote?.detourKm ?? 0), 0) * 10) / 10,
    unallocatedKg: Math.round(cases.filter((c) => c.status === "closed" || c.status === "no_destination").reduce((s, c) => s + availableKg(c), 0) * 10) / 10,
  }
}
