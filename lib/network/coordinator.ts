import { allocateTier, matchResource } from "./match.ts"
import { backhaulQuote, courierQuote, ownCourierQuote, pickupQuote } from "./logistics.ts"
import { hhmm } from "./zones.ts"
import { DEFAULT_POLICY, TIER_LABEL, type DeliveryMode, type Match, type Ms, type Network, type NetworkCase, type NetworkEvent, type Policy, type Quote, type Reservation, type ReservationStatus, type Resource } from "./types.ts"

// Coordination of one lot through the network, as pure functions over a NetworkCase.
// Notification (waves) → reservation (partial holds that expire) → logistics (receiver decides and pays
// for delivery; carrier confirms capacity) → handoff code → verified receipt. Every step appends to an
// event log that is never rewritten; tracking and impact are read from it.

export class NetworkError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = "NetworkError"
    this.code = code
  }
}

const HOLDING: ReservationStatus[] = ["held", "awaiting_acceptance", "awaiting_capacity"]
const ACTIVE: ReservationStatus[] = [...HOLDING, "scheduled", "in_transit", "delivered"]

function log(c: NetworkCase, at: Ms, type: string, actor: string, detail: Record<string, unknown> = {}): NetworkEvent[] {
  return [...c.events, { seq: c.events.length + 1, at, type, actor, detail }]
}

export function availableKg(c: NetworkCase): number {
  const held = c.reservations.filter((r) => ACTIVE.includes(r.status)).reduce((s, r) => s + r.kg, 0)
  return Math.round((c.resource.kg - held) * 10) / 10
}

export function notified(c: NetworkCase): Set<string> {
  return new Set(c.waves.flatMap((w) => w.notified))
}

export function handoffCode(reservationId: string): string {
  let h = 7
  for (const ch of reservationId) h = (h * 31 + ch.charCodeAt(0)) % 9000
  return String(1000 + h)
}

function nextWave(c: NetworkCase, network: Network, now: Ms, policy: Policy): NetworkCase {
  const kg = availableKg(c)
  const matches = matchResource(c.resource, network, kg, now)
  const sent = notified(c)
  let tier = c.activeTier
  let passed = c.passedTiers
  let events = c.events
  for (;;) {
    if (!tier) {
      const status = c.reservations.some((r) => ACTIVE.includes(r.status)) ? c.status : "no_destination"
      return { ...c, activeTier: null, passedTiers: passed, status, events: [...events, { seq: events.length + 1, at: now, type: "cascade_exhausted", actor: "grinflow", detail: { remainingKg: kg } }] }
    }
    const pending = matches.filter((m) => m.tier === tier && m.eligible && !sent.has(m.participantId)).slice(0, policy.waveSize)
    if (pending.length) {
      const wave = { n: c.waves.length + 1, tier, at: now, notified: pending.map((m) => m.participantId) }
      events = [...events, { seq: events.length + 1, at: now, type: "wave_sent", actor: "grinflow", detail: { wave: wave.n, tier, to: pending.map((m) => m.name), kg } }]
      return { ...c, activeTier: tier, passedTiers: passed, waves: [...c.waves, wave], events }
    }
    // Nobody left to notify in this tier: what remains cascades to the next tier.
    passed = [...passed, tier]
    const next = allocateTier(matches, passed)
    events = [...events, { seq: events.length + 1, at: now, type: "tier_passed", actor: "grinflow", detail: { from: tier, to: next, remainingKg: kg, reason: `sin más destinos viables en ${TIER_LABEL[tier]}` } }]
    tier = next
  }
}

export function publish(resource: Resource, network: Network, now: Ms, policy: Policy = DEFAULT_POLICY): NetworkCase {
  const matches = matchResource(resource, network, resource.kg, now)
  const tier = allocateTier(matches, [])
  const base: NetworkCase = { resource, area: network.area, status: "open", activeTier: tier, passedTiers: [], waves: [], reservations: [], events: [], publishedAt: now }
  const events = log(base, now, "resource_published", resource.donorId, {
    title: resource.title,
    kg: resource.kg,
    condition: resource.condition,
    window: `${hhmm(resource.pickupWindow.start)}–${hhmm(resource.pickupWindow.end)}`,
    eligible: matches.filter((m) => m.eligible).map((m) => `${m.name} (${TIER_LABEL[m.tier]}, zona ${m.zone})`),
    excluded: matches.filter((m) => !m.eligible).map((m) => `${m.name}: ${m.blocks[0].message}`),
    firstTier: tier,
  })
  const started = { ...base, events }
  if (!tier) return { ...started, status: "no_destination", events: log(started, now, "cascade_exhausted", "grinflow", { remainingKg: resource.kg }) }
  return nextWave(started, network, now, policy)
}

/** Advance the clock: expire holds, then widen the wave or cascade if the lot is still not fully reserved. */
export function tick(c: NetworkCase, network: Network, now: Ms, policy: Policy = DEFAULT_POLICY): NetworkCase {
  let next = c
  for (const r of c.reservations) {
    if (HOLDING.includes(r.status) && r.holdUntil !== null && now >= r.holdUntil) {
      next = { ...next, reservations: next.reservations.map((x) => (x.id === r.id ? { ...x, status: "expired" as const } : x)), events: log(next, now, "hold_expired", "grinflow", { reservation: r.id, kg: r.kg, participant: r.participantId }) }
      if (next.status === "fully_reserved") next = { ...next, status: "open" }
    }
  }
  if (next.status !== "open" || availableKg(next) <= 0) return next
  if (now >= next.resource.pickupWindow.end) return closeIfDone(next, now)
  const last = next.waves.at(-1)
  if (!last || now - last.at >= policy.waveIntervalMinutes * 60_000) return nextWave(next, network, now, policy)
  return next
}

function matchFor(c: NetworkCase, network: Network, participantId: string, now: Ms): Match {
  const m = matchResource(c.resource, network, availableKg(c), now).find((x) => x.participantId === participantId)
  if (!m) throw new NetworkError("unknown_participant", "Participante no registrado como destino.")
  return m
}

function getRes(c: NetworkCase, id: string): Reservation {
  const r = c.reservations.find((x) => x.id === id)
  if (!r) throw new NetworkError("unknown_reservation", "Apartado no encontrado.")
  return r
}

function update(c: NetworkCase, id: string, patch: Partial<Reservation>): Reservation[] {
  return c.reservations.map((r) => (r.id === id ? { ...r, ...patch } : r))
}

/** Apartar: a notified participant holds part (or all) of the lot for a limited time. */
export function reserve(c: NetworkCase, network: Network, participantId: string, kg: number, now: Ms, policy: Policy = DEFAULT_POLICY): NetworkCase {
  if (c.status !== "open") throw new NetworkError("not_open", "Este recurso ya no recibe apartados.")
  if (!notified(c).has(participantId)) throw new NetworkError("not_notified", "Solo quien recibió la oferta puede apartar.")
  if (now >= c.resource.pickupWindow.end) throw new NetworkError("window_closed", "La ventana de recolección ya cerró.")
  const m = matchFor(c, network, participantId, now)
  if (!m.eligible) throw new NetworkError("not_eligible", m.blocks[0].message)
  const left = availableKg(c)
  if (!(kg > 0) || kg > left) throw new NetworkError("over_available", `Solo quedan ${left} kg disponibles.`)
  const need = network.participants.find((p) => p.id === participantId)!.need!
  if (kg < need.minKg) throw new NetworkError("below_minimum", `El mínimo para ${m.name} es ${need.minKg} kg.`)
  if (kg > m.maxKg) throw new NetworkError("over_capacity", `${m.name} puede recibir hasta ${m.maxKg} kg.`)
  const id = `${c.resource.id}-r${c.reservations.length + 1}`
  const reservation: Reservation = {
    id, participantId, tier: m.tier, kg, createdAt: now,
    holdUntil: Math.min(now + policy.holdMinutes * 60_000, c.resource.pickupWindow.end),
    status: "held", quote: null, quoteAcceptedAt: null, capacityConfirmedAt: null, handoffCode: null,
    pickedUpAt: null, receivedKg: null, receivedAt: null, stopReason: null,
  }
  const next = { ...c, reservations: [...c.reservations, reservation] }
  const events = log(next, now, "reserved", participantId, { reservation: id, kg, tier: m.tier, holdUntil: hhmm(reservation.holdUntil!), remainingKg: availableKg(next) })
  return { ...next, events, status: availableKg(next) <= 0 ? "fully_reserved" : "open" }
}

/** Delivery options for a reservation, as the receiver would see them. */
export function deliveryChoices(c: NetworkCase, network: Network, reservationId: string, now: Ms): Quote[] {
  const r = getRes(c, reservationId)
  const m = matchFor(c, network, r.participantId, now)
  const dest = network.participants.find((p) => p.id === r.participantId)!
  const quotes: Quote[] = []
  if (m.zone === "a") {
    const q = pickupQuote(c.resource, dest, now).quote
    if (q) quotes.push(q)
  }
  if (m.zone !== "c" && network.vehicles.length === 0) {
    const q = ownCourierQuote(c.resource, dest, now).quote
    if (q) quotes.push(q)
  }
  if (m.zone !== "c") {
    for (const v of network.vehicles) {
      const q = (v.kind === "courier" ? courierQuote : backhaulQuote)(c.resource, dest, v, r.kg, now).quote
      if (q) quotes.push(q)
    }
  }
  return quotes.sort((a, b) => a.costMxn - b.costMxn || a.arrivalAt - b.arrivalAt)
}

/** The receiver picks how to receive. Pickup is confirmed at once; courier and backhaul wait for cost acceptance and capacity. */
export function chooseDelivery(c: NetworkCase, network: Network, reservationId: string, mode: DeliveryMode, now: Ms, vehicleId: string | null = null): NetworkCase {
  const r = getRes(c, reservationId)
  if (r.status !== "held") throw new NetworkError("bad_state", "La forma de entrega ya se eligió.")
  const quote = deliveryChoices(c, network, reservationId, now).find((q) => q.mode === mode && (vehicleId === null || q.vehicleId === vehicleId))
  if (!quote) throw new NetworkError("option_unavailable", "Esa forma de entrega no es viable para este apartado.")
  if (mode === "pickup" || mode === "own_courier") {
    const code = handoffCode(r.id)
    const next = { ...c, reservations: update(c, r.id, { status: "scheduled", quote, holdUntil: null, handoffCode: code }) }
    return { ...next, events: log(next, now, "pickup_scheduled", r.participantId, { reservation: r.id, mode, pickupAt: hhmm(quote.pickupAt), costMxn: 0, code }) }
  }
  const next = { ...c, reservations: update(c, r.id, { status: "awaiting_acceptance", quote }) }
  return { ...next, events: log(next, now, "quote_presented", "grinflow", { reservation: r.id, mode, vehicle: quote.label, costMxn: quote.costMxn, arrivalAt: hhmm(quote.arrivalAt), detourKm: quote.detourKm, simulated: quote.simulated }) }
}

export function acceptQuote(c: NetworkCase, reservationId: string, actorId: string, now: Ms): NetworkCase {
  const r = getRes(c, reservationId)
  if (r.status !== "awaiting_acceptance") throw new NetworkError("bad_state", "No hay cotización pendiente.")
  if (actorId !== r.participantId) throw new NetworkError("not_receiver", "Solo quien recibe acepta el costo.")
  const next = { ...c, reservations: update(c, r.id, { status: "awaiting_capacity", quoteAcceptedAt: now }) }
  return { ...next, events: log(next, now, "quote_accepted", actorId, { reservation: r.id, costMxn: r.quote!.costMxn }) }
}

export function declineQuote(c: NetworkCase, reservationId: string, actorId: string, now: Ms): NetworkCase {
  const r = getRes(c, reservationId)
  if (r.status !== "awaiting_acceptance") throw new NetworkError("bad_state", "No hay cotización pendiente.")
  const next = { ...c, reservations: update(c, r.id, { status: "held", quote: null }) }
  return { ...next, events: log(next, now, "quote_declined", actorId, { reservation: r.id }) }
}

/** The carrier (or route operator) confirms it has the capacity. Only then is transport confirmed. */
export function confirmCapacity(c: NetworkCase, network: Network, reservationId: string, operatorId: string, now: Ms): NetworkCase {
  const r = getRes(c, reservationId)
  if (r.status !== "awaiting_capacity") throw new NetworkError("bad_state", "El receptor todavía no acepta el costo.")
  const vehicle = network.vehicles.find((v) => v.id === r.quote!.vehicleId)
  if (!vehicle || vehicle.operatorId !== operatorId) throw new NetworkError("not_carrier", "Solo el operador del vehículo confirma capacidad.")
  const code = handoffCode(r.id)
  const next = { ...c, reservations: update(c, r.id, { status: "scheduled", capacityConfirmedAt: now, holdUntil: null, handoffCode: code }) }
  return { ...next, events: log(next, now, "transport_confirmed", operatorId, { reservation: r.id, vehicle: vehicle.label, pickupAt: hhmm(r.quote!.pickupAt), code }) }
}

/** At the door: whoever collects shows the handoff code. A wrong code does not release anything. */
export function recordPickup(c: NetworkCase, reservationId: string, code: string, actorId: string, now: Ms): NetworkCase {
  const r = getRes(c, reservationId)
  if (r.status !== "scheduled") throw new NetworkError("bad_state", "Este apartado no está listo para entregarse.")
  if (code.trim() !== r.handoffCode) throw new NetworkError("code_mismatch", "El código de entrega no coincide.")
  const next = { ...c, reservations: update(c, r.id, { status: "in_transit", pickedUpAt: now }) }
  return { ...next, events: log(next, now, "picked_up", actorId, { reservation: r.id, kg: r.kg }) }
}

/** The donor can stop a handoff over an anomaly (wrong person, code, quantity, safety). A person must step in. */
export function stopHandoff(c: NetworkCase, reservationId: string, reason: string, actorId: string, now: Ms): NetworkCase {
  const r = getRes(c, reservationId)
  if (!["scheduled", "in_transit"].includes(r.status)) throw new NetworkError("bad_state", "Solo se detiene una entrega en curso.")
  if (actorId !== c.resource.donorId) throw new NetworkError("not_donor", "Solo el donante detiene una entrega.")
  const next = { ...c, reservations: update(c, r.id, { status: "stopped", stopReason: reason }) }
  return { ...next, events: log(next, now, "handoff_stopped", actorId, { reservation: r.id, reason, escalation: "intervención humana solicitada" }) }
}

/** Verified outcome: the receiver confirms what actually arrived. Impact counts only this. */
export function confirmReceipt(c: NetworkCase, reservationId: string, receivedKg: number, actorId: string, now: Ms): NetworkCase {
  const r = getRes(c, reservationId)
  if (r.status !== "in_transit") throw new NetworkError("bad_state", "Primero debe registrarse la recolección.")
  if (actorId !== r.participantId) throw new NetworkError("not_receiver", "Solo quien recibe confirma la recepción.")
  if (!(receivedKg > 0) || receivedKg > r.kg) throw new NetworkError("bad_quantity", `Se apartaron ${r.kg} kg.`)
  const next = { ...c, reservations: update(c, r.id, { status: "delivered", receivedKg, receivedAt: now }) }
  return closeIfDone({ ...next, events: log(next, now, "received", actorId, { reservation: r.id, kg: receivedKg, tier: r.tier }) }, now)
}

export function cancelReservation(c: NetworkCase, reservationId: string, actorId: string, now: Ms): NetworkCase {
  const r = getRes(c, reservationId)
  if (!HOLDING.includes(r.status) && r.status !== "scheduled") throw new NetworkError("bad_state", "Este apartado ya no se puede cancelar.")
  const next = { ...c, reservations: update(c, r.id, { status: "cancelled" }), status: c.status === "fully_reserved" ? ("open" as const) : c.status }
  return { ...next, events: log(next, now, "reservation_cancelled", actorId, { reservation: r.id, kg: r.kg }) }
}

function closeIfDone(c: NetworkCase, now: Ms): NetworkCase {
  const pending = c.reservations.some((r) => ["held", "awaiting_acceptance", "awaiting_capacity", "scheduled", "in_transit"].includes(r.status))
  const exhausted = availableKg(c) <= 0 || now >= c.resource.pickupWindow.end || c.activeTier === null
  if (pending || !exhausted || c.status === "closed") return c
  return { ...c, status: "closed", events: log(c, now, "case_closed", "grinflow", { deliveredKg: c.reservations.reduce((s, r) => s + (r.receivedKg ?? 0), 0), unallocatedKg: availableKg(c) }) }
}
