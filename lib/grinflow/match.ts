import { distanceKm, overlap, travelMinutes } from "./geo.ts"
import type { Block, Destination, Offer, Proposal, Vehicle } from "./types.ts"

const MUST_BE_CONFIRMED = ["quantity", "weightKg", "condition", "pickupWindow"] as const

// Evaluate one destination + vehicle combination. Hard constraints first; scoring only if nothing blocks.
export function evaluate(offer: Offer, destination: Destination, vehicle: Vehicle): Proposal {
  const blocks: Block[] = []
  const reasons: string[] = []

  for (const field of MUST_BE_CONFIRMED) {
    if (offer[field].status !== "confirmed") {
      blocks.push({ code: `unconfirmed_${field}`, message: `Falta confirmar ${field} con el donante.` })
    }
  }

  const category = offer.category.value
  if (category === null || !destination.acceptedCategories.includes(category)) {
    blocks.push({ code: "category_not_accepted", message: `${destination.name} no recibe la categoría ${category ?? "desconocida"}.` })
  }

  const condition = offer.condition.value ?? "unknown"
  if (!destination.acceptsConditions.includes(condition)) {
    blocks.push({ code: "condition_not_accepted", message: `${destination.name} no recibe producto en estado ${condition}.` })
  }
  if (destination.use === "human_consumption" && (condition === "unknown" || condition === "damaged")) {
    blocks.push({ code: "unsafe_for_people", message: "Producto en estado desconocido o dañado no puede ir a consumo humano." })
  }

  const weight = offer.weightKg.value ?? 0
  if (weight > destination.capacityKg) {
    blocks.push({ code: "destination_capacity", message: `${destination.name} solo puede recibir ${destination.capacityKg} kg hoy.` })
  }
  if (weight > vehicle.capacityKg) {
    blocks.push({ code: "vehicle_capacity", message: `${vehicle.label} carga hasta ${vehicle.capacityKg} kg.` })
  }
  if (!vehicle.availabilityConfirmed) {
    blocks.push({ code: "vehicle_unconfirmed", message: `La disponibilidad de ${vehicle.label} no está confirmada.` })
  }

  const pickupPoint = offer.pickupLocation.value
  const toDestination = pickupPoint ? distanceKm(pickupPoint, destination.location) : Infinity
  const toPickup = pickupPoint ? distanceKm(vehicle.location, pickupPoint) : Infinity
  const totalKm = toPickup + toDestination

  // The vehicle must reach the donor inside both windows, then reach the destination before it closes.
  const pickupWindow = offer.pickupWindow.value
  const pickupSlot = pickupWindow ? overlap(pickupWindow, vehicle.availableWindow) : null
  const pickupAt = pickupSlot
    ? Math.max(Date.parse(pickupSlot.start), Date.parse(vehicle.availableWindow.start) + travelMinutes(toPickup) * 60_000)
    : NaN
  let slackMinutes = 0
  if (!pickupSlot || pickupAt > Date.parse(pickupSlot.end)) {
    blocks.push({ code: "no_pickup_slot", message: `${vehicle.label} no llega a tiempo al horario de recogida.` })
  } else {
    const arrival = pickupAt + travelMinutes(toDestination) * 60_000
    const receivingStart = Date.parse(destination.receivingWindow.start)
    const receivingEnd = Date.parse(destination.receivingWindow.end)
    const deliverAt = Math.max(arrival, receivingStart)
    if (deliverAt >= receivingEnd) {
      blocks.push({ code: "no_delivery_slot", message: `No se llega a ${destination.name} antes de que cierre la recepción.` })
    } else {
      slackMinutes = Math.round((receivingEnd - deliverAt) / 60_000)
    }
  }

  const id = `${offer.id}:${destination.id}:${vehicle.id}`
  const distance = Math.round(totalKm * 10) / 10
  if (blocks.length > 0) {
    return { id, destinationId: destination.id, vehicleId: vehicle.id, feasible: false, blocks, score: null, reasons, distanceKm: distance }
  }

  // Weighted score in [0, 100]. Weights are a starting point to be tuned with real operations.
  const useScore = destination.use === "human_consumption" ? 1 : 0.4
  const distanceScore = Math.max(0, 1 - totalKm / 30)
  const loadScore = Math.min(1, weight / vehicle.capacityKg)
  const slackScore = Math.min(1, slackMinutes / 120)
  const score = Math.round(100 * (0.4 * useScore + 0.3 * distanceScore + 0.15 * loadScore + 0.15 * slackScore))

  reasons.push(destination.use === "human_consumption" ? "Destino de consumo humano: primer nivel de la cascada." : "Destino de valorización: el producto no se pierde.")
  reasons.push(`${distance} km estimados en línea recta (ruta no verificada).`)
  reasons.push(`Usa ${Math.round(loadScore * 100)}% de la capacidad de ${vehicle.label}.`)
  reasons.push(`Margen de ${slackMinutes} min antes del cierre de recepción.`)

  return { id, destinationId: destination.id, vehicleId: vehicle.id, feasible: true, blocks, score, reasons, distanceKm: distance }
}

// All combinations, feasible first by score, then blocked ones so the operator sees why they were excluded.
export function rankProposals(offer: Offer, destinations: Destination[], vehicles: Vehicle[]): Proposal[] {
  const all = destinations.flatMap((d) => vehicles.map((v) => evaluate(offer, d, v)))
  return all.sort((a, b) => {
    if (a.feasible !== b.feasible) return a.feasible ? -1 : 1
    if (a.feasible && b.feasible) return (b.score ?? 0) - (a.score ?? 0)
    return a.blocks.length - b.blocks.length
  })
}
