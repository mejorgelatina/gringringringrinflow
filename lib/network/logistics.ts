import { etaMinutes, roadKm, weeklyEnd, weeklyStart } from "./zones.ts"
import type { Block, Ms, Participant, Quote, Resource, Vehicle } from "./types.ts"

// Logistics engine: how a resource gets from origin to destination. Three options, decided by the receiver:
//  - pickup: the receiver collects it; no transport cost.
//  - courier: grinflow coordinates a delivery and shows a quote; the receiver pays if it accepts.
//  - backhaul: spare room on a trip a vehicle is already making; any detour cost is shown before confirming.
// Quotes are simulated here. Nothing is confirmed until the receiver accepts the cost and the carrier confirms capacity.

export const MAX_BACKHAUL_DETOUR_KM = 8

type Slot = { pickupAt: Ms; arrivalAt: Ms } | null

/** Earliest pickup (not before `ready`) whose arrival lands inside the receiver's window today. */
export function slot(resource: Resource, dest: Participant, ready: Ms, eta: number): Slot {
  const need = dest.need!
  const recvStart = weeklyStart(need.receiving, resource.pickupWindow.start)
  const recvEnd = weeklyEnd(need.receiving, resource.pickupWindow.start)
  if (recvStart === null || recvEnd === null) return null
  const pickupAt = Math.max(ready, resource.pickupWindow.start, recvStart - eta * 60_000)
  const arrivalAt = pickupAt + eta * 60_000
  if (pickupAt > resource.pickupWindow.end || arrivalAt > recvEnd) return null
  return { pickupAt, arrivalAt }
}

export function pickupQuote(resource: Resource, dest: Participant, now: Ms): { quote: Quote | null; block: Block | null } {
  const need = dest.need!
  const eta = etaMinutes(resource.location, dest.location, Math.max(now, resource.pickupWindow.start))
  if (!need.selfPickup) return { quote: null, block: { code: "no_self_pickup", message: `${dest.name} no recoge por su cuenta.` } }
  if (eta > need.selfPickupMaxMinutes) return { quote: null, block: { code: "beyond_self_pickup", message: `${eta} min excede el alcance de recolección de ${dest.name} (${need.selfPickupMaxMinutes} min).` } }
  if (resource.refrigerationNeeded) return { quote: null, block: { code: "needs_refrigeration", message: "Requiere transporte refrigerado." } }
  const s = slot(resource, dest, now, eta)
  if (!s) return { quote: null, block: { code: "no_slot", message: "No hay horario de recolección compatible con la ventana de recepción." } }
  return {
    quote: { mode: "pickup", vehicleId: null, label: `${dest.name} recoge`, costMxn: 0, roadKm: roadKm(resource.location, dest.location), detourKm: 0, ...s, simulated: false },
    block: null,
  }
}

export function courierQuote(resource: Resource, dest: Participant, vehicle: Vehicle, kg: number, now: Ms): { quote: Quote | null; block: Block | null } {
  if (vehicle.kind !== "courier") return { quote: null, block: { code: "not_courier", message: "No es un servicio de envío." } }
  if (vehicle.capacityKg < kg) return { quote: null, block: { code: "vehicle_capacity", message: `${vehicle.label} lleva hasta ${vehicle.capacityKg} kg.` } }
  if (resource.refrigerationNeeded && !vehicle.refrigerated) return { quote: null, block: { code: "needs_refrigeration", message: "Requiere transporte refrigerado." } }
  const toPickup = etaMinutes(vehicle.location, resource.location, now)
  const eta = etaMinutes(resource.location, dest.location, Math.max(now, resource.pickupWindow.start))
  const s = slot(resource, dest, Math.max(now + toPickup * 60_000, vehicle.available.start), eta)
  if (!s || s.arrivalAt > vehicle.available.end) return { quote: null, block: { code: "no_slot", message: `${vehicle.label} no llega dentro de las ventanas.` } }
  const km = roadKm(resource.location, dest.location)
  const costMxn = Math.round(vehicle.pricing.baseMxn + vehicle.pricing.perKmMxn * km)
  return { quote: { mode: "courier", vehicleId: vehicle.id, label: vehicle.label, costMxn, roadKm: km, detourKm: 0, ...s, simulated: true }, block: null }
}

export function backhaulQuote(resource: Resource, dest: Participant, vehicle: Vehicle, kg: number, now: Ms): { quote: Quote | null; block: Block | null } {
  if (vehicle.kind !== "route" || !vehicle.routeEnd) return { quote: null, block: { code: "not_route", message: "No es un viaje existente." } }
  if (vehicle.capacityKg < kg) return { quote: null, block: { code: "vehicle_capacity", message: `${vehicle.label} tiene ${vehicle.capacityKg} kg libres.` } }
  if (resource.refrigerationNeeded && !vehicle.refrigerated) return { quote: null, block: { code: "needs_refrigeration", message: "Requiere transporte refrigerado." } }
  const direct = roadKm(vehicle.location, vehicle.routeEnd)
  const via = roadKm(vehicle.location, resource.location) + roadKm(resource.location, dest.location) + roadKm(dest.location, vehicle.routeEnd)
  const detourKm = Math.round((via - direct) * 10) / 10
  if (detourKm > MAX_BACKHAUL_DETOUR_KM) return { quote: null, block: { code: "detour_too_long", message: `El desvío sería de ${detourKm} km (máximo ${MAX_BACKHAUL_DETOUR_KM}).` } }
  const toPickup = etaMinutes(vehicle.location, resource.location, now)
  const eta = etaMinutes(resource.location, dest.location, Math.max(now, resource.pickupWindow.start))
  const s = slot(resource, dest, Math.max(now + toPickup * 60_000, vehicle.available.start), eta)
  if (!s || s.arrivalAt > vehicle.available.end) return { quote: null, block: { code: "no_slot", message: `${vehicle.label} no pasa dentro de las ventanas.` } }
  const costMxn = Math.round(vehicle.pricing.baseMxn + vehicle.pricing.perKmMxn * Math.max(0, detourKm))
  return { quote: { mode: "backhaul", vehicleId: vehicle.id, label: vehicle.label, costMxn, roadKm: roadKm(resource.location, dest.location), detourKm, ...s, simulated: true }, block: null }
}

/**
 * The receiver sends its own courier (uber or a messenger it already uses) and pays it directly.
 * grinflow quotes nothing; it checks the timing fits and issues a handoff code. A regular car can't keep
 * the cold chain, so refrigerated lots are blocked here.
 */
export function ownCourierQuote(resource: Resource, dest: Participant, now: Ms): { quote: Quote | null; block: Block | null } {
  if (resource.refrigerationNeeded) return { quote: null, block: { code: "needs_refrigeration", message: "Requiere transporte refrigerado." } }
  const eta = etaMinutes(resource.location, dest.location, Math.max(now, resource.pickupWindow.start))
  const s = slot(resource, dest, now, eta)
  if (!s) return { quote: null, block: { code: "no_slot", message: "No hay horario de envío compatible con la ventana de recepción." } }
  return {
    quote: { mode: "own_courier", vehicleId: null, label: `${dest.name} manda su propio envío (uber u otro), a su cargo`, costMxn: 0, roadKm: roadKm(resource.location, dest.location), detourKm: 0, ...s, simulated: false },
    block: null,
  }
}

/** Every delivery option open to this destination for `kg`, cheapest first. */
export function deliveryOptions(resource: Resource, dest: Participant, vehicles: Vehicle[], kg: number, now: Ms, zone: "a" | "b" | "c"): { quotes: Quote[]; blocks: Block[] } {
  const quotes: Quote[] = []
  const blocks: Block[] = []
  const take = (r: { quote: Quote | null; block: Block | null }) => (r.quote ? quotes.push(r.quote) : r.block && blocks.push(r.block))
  if (zone === "a") take(pickupQuote(resource, dest, now))
  // No coordinated carriers in this network: the receiver can still send its own courier.
  if (zone !== "c" && vehicles.length === 0) take(ownCourierQuote(resource, dest, now))
  if (zone !== "c") {
    for (const v of vehicles) {
      if (v.kind === "courier") take(courierQuote(resource, dest, v, kg, now))
      else take(backhaulQuote(resource, dest, v, kg, now))
    }
  }
  quotes.sort((a, b) => a.costMxn - b.costMxn || a.arrivalAt - b.arrivalAt)
  return { quotes, blocks }
}
