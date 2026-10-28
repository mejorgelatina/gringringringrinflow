import { evaluateMatch } from "../engines/match-engine.mjs"
import { distanceKm, overlap, travelMinutes } from "./geo.ts"
import type { Block, Destination, Offer, Proposal, RouteEstimate, RouteReview, Vehicle } from "./types.ts"

// Adapter over the v0.10 match engine (lib/engines/match-engine.mjs).
// The engine owns the hard gates and the score; this file maps the flow's offer into its shape,
// adds pickup/delivery window checks it does not do, and supplies a route only after a human reviewed it.

export const pairKey = (destinationId: string, vehicleId: string) => `${destinationId}:${vehicleId}`

const CONDITION_LABEL: Record<string, string> = {
  edible: "apto para consumo",
  past_prime: "pasado de su mejor momento",
  inedible: "no apto para consumo",
  unknown: "desconocido",
}

// Straight-line timing: vehicle → donor inside both windows, then donor → destination before it closes.
export function estimateRoute(offer: Offer, destination: Destination, vehicle: Vehicle): { estimate: RouteEstimate; blocks: Block[]; slackMinutes: number } {
  const blocks: Block[] = []
  const pickup = offer.pickupLocation.value
  const toPickup = pickup ? distanceKm(vehicle.location, pickup) : NaN
  const toDestination = pickup ? distanceKm(pickup, destination.location) : NaN
  const km = Math.round((toPickup + toDestination) * 10) / 10
  const estimate: RouteEstimate = {
    distanceKm: km,
    durationMinutes: Number.isFinite(km) ? travelMinutes(toPickup) + travelMinutes(toDestination) : NaN,
    pickupAt: null,
    estimatedArrivalAt: null,
    source: "straight_line_estimate",
  }

  const window = offer.pickupWindow.value
  const slot = window ? overlap(window, vehicle.availableWindow) : null
  const pickupAt = slot ? Math.max(Date.parse(slot.start), Date.parse(vehicle.availableWindow.start) + travelMinutes(toPickup) * 60_000) : NaN
  if (!slot || !(pickupAt <= Date.parse(slot.end))) {
    blocks.push({ code: "no_pickup_slot", message: `${vehicle.label} no llega a tiempo al horario de recogida.` })
    return { estimate, blocks, slackMinutes: 0 }
  }
  const deliverAt = Math.max(pickupAt + travelMinutes(toDestination) * 60_000, Date.parse(destination.receivingWindow.start))
  estimate.pickupAt = new Date(pickupAt).toISOString()
  estimate.estimatedArrivalAt = new Date(deliverAt).toISOString()
  const receivingEnd = Date.parse(destination.receivingWindow.end)
  if (deliverAt >= receivingEnd) {
    blocks.push({ code: "no_delivery_slot", message: `No se llega a ${destination.name} antes de que cierre la recepción.` })
    return { estimate, blocks, slackMinutes: 0 }
  }
  return { estimate, blocks, slackMinutes: Math.round((receivingEnd - deliverAt) / 60_000) }
}

export function evaluate(offer: Offer, destination: Destination, vehicle: Vehicle, review: RouteReview | null, now: string): Proposal {
  const { estimate, blocks: windowBlocks, slackMinutes } = estimateRoute(offer, destination, vehicle)
  const result = evaluateMatch({
    offer: {
      category: offer.category.value,
      // The engine compares quantity with recipient and transport capacity, so the flow sends weight in kg.
      quantity: offer.weightKg.value,
      unit: "kg",
      quantityConfirmed: offer.weightKg.status === "confirmed" && offer.quantity.status === "confirmed",
      condition: offer.condition.value ?? "unknown",
      conditionConfirmed: offer.condition.status === "confirmed",
      deadline: offer.pickupWindow.status === "confirmed" ? offer.pickupWindow.value?.end : null,
    },
    recipient: {
      id: destination.id,
      categories: destination.acceptedCategories,
      conditionPolicy: destination.acceptsConditions,
      confirmed: destination.confirmed,
      capacity: destination.capacityKg,
      intendedUse: destination.use,
      availableUntil: destination.receivingWindow.end,
    },
    transport: {
      id: vehicle.id,
      confirmed: vehicle.availabilityConfirmed,
      status: vehicle.availabilityConfirmed ? "available" : "unconfirmed",
      capacity: vehicle.capacityKg,
      unit: "kg",
      availableUntil: vehicle.availableWindow.end,
    },
    route: review
      ? {
          verified: true,
          provider: "revision_humana_demo",
          distanceKm: review.distanceKm,
          durationMinutes: review.durationMinutes,
          estimatedArrivalAt: Date.parse(review.estimatedArrivalAt),
          verifiedAt: review.reviewedAt,
        }
      : null,
    now: Date.parse(now),
  }) as { eligible: boolean; score: number | null; scoreVersion: string; blockers: Block[]; warnings: Block[] }

  const blocks = [...result.blockers, ...windowBlocks]
  const feasible = blocks.length === 0
  const reasons: string[] = []
  if (feasible) {
    reasons.push(destination.use === "human_consumption" ? "Destino de consumo humano: primer nivel de la cascada." : "Destino de valorización: el producto no se pierde.")
    reasons.push(`Producto ${CONDITION_LABEL[offer.condition.value ?? "unknown"]}, confirmado por el donante.`)
    reasons.push(`${estimate.distanceKm} km y ${estimate.durationMinutes} min; ruta revisada por una persona.`)
    reasons.push(`Usa ${Math.round(((offer.weightKg.value ?? 0) / vehicle.capacityKg) * 100)}% de la capacidad de ${vehicle.label}.`)
    reasons.push(`Margen de ${slackMinutes} min antes del cierre de recepción.`)
  }

  return {
    id: `${offer.id}:${pairKey(destination.id, vehicle.id)}`,
    destinationId: destination.id,
    vehicleId: vehicle.id,
    feasible,
    blocks,
    warnings: result.warnings,
    score: feasible ? result.score : null,
    scoreVersion: result.scoreVersion,
    reasons,
    estimate,
    routeReviewed: review !== null,
  }
}

// Only the route is missing: a person can review the estimate and unblock it.
export function onlyNeedsRouteReview(p: Proposal): boolean {
  return !p.feasible && p.blocks.length > 0 && p.blocks.every((b) => b.code === "route_unverified")
}

export function rankProposals(offer: Offer, destinations: Destination[], vehicles: Vehicle[], reviews: RouteReview[], now: string): Proposal[] {
  const all = destinations.flatMap((d) =>
    vehicles.map((v) => evaluate(offer, d, v, reviews.find((r) => r.pairKey === pairKey(d.id, v.id)) ?? null, now)),
  )
  const rank = (p: Proposal) => (p.feasible ? 0 : onlyNeedsRouteReview(p) ? 1 : 2)
  return all.sort((a, b) => rank(a) - rank(b) || (b.score ?? 0) - (a.score ?? 0) || a.estimate.distanceKm - b.estimate.distanceKm || a.blocks.length - b.blocks.length)
}
