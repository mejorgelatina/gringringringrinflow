import { deliveryOptions } from "./logistics.ts"
import { distanceKm, etaMinutes, inServiceArea, roadKm, weeklyEnd, zoneFor } from "./zones.ts"
import type { Block, DeliveryMode, Match, Ms, Network, Participant, Resource, Tier } from "./types.ts"
import { TIERS } from "./types.ts"

// Matching engine: eligibility filters first, ranking only among the eligible. A score never overrides a block.
// Allocation engine: the cascade people → transformation → compost; a tier is offered only when no
// earlier tier has a viable destination (or earlier tiers were exhausted for this lot).

const norm = (s: string) => s.toLocaleLowerCase("es-MX").normalize("NFD").replace(/[̀-ͯ]/g, "")

export function evaluateDestination(resource: Resource, dest: Participant, network: Network, availableKg: number, now: Ms): Match {
  const need = dest.need!
  const blocks: Block[] = []
  const block = (code: string, message: string) => blocks.push({ code, message })

  if (!dest.verified) block("not_verified", "Participante sin validar por grinflow.")
  if (!inServiceArea(network.area, dest.location)) block("out_of_service_area", `Fuera de ${network.area.name}.`)
  // Discovery: the generator's impact zone and the receiver's own service area. Feasibility comes after.
  const km = Math.round(distanceKm(resource.location, dest.location) * 10) / 10
  const generator = network.participants.find((p) => p.id === resource.donorId)?.generator
  if (generator && km > generator.impactRadiusKm) block("outside_impact_zone", `A ${km} km: fuera de la zona de impacto del generador (${generator.impactRadiusKm} km).`)
  if (dest.serviceRadiusKm !== undefined && km > dest.serviceRadiusKm) block("outside_receiver_area", `A ${km} km: fuera del área de servicio que declaró (${dest.serviceRadiusKm} km).`)

  // Food safety first: unknown or unconfirmed condition never becomes food for people.
  if (need.tier === "people" && (resource.condition !== "edible" || !resource.conditionConfirmed)) {
    block("not_safe_for_people", "Condición no confirmada como apta para consumo humano.")
  }

  if (need.materials) {
    const label = norm(`${resource.item} ${resource.material ?? ""}`)
    if (!need.materials.some((m) => label.includes(norm(m)))) block("material_not_accepted", `Solo recibe ${need.materials[0]}.`)
  } else if (!need.categories.includes(resource.category)) {
    block("category_not_accepted", `No recibe la categoría "${resource.category}".`)
  }
  if (!need.conditions.includes(resource.condition)) block("condition_not_accepted", `No acepta producto en condición "${resource.condition}".`)
  const missing = need.requires.filter((r) => !resource.attributes.map(norm).includes(norm(r)))
  if (missing.length) block("specs_not_met", `Requiere material ${missing.join(", ")}.`)

  const weeklyLeft = Math.max(0, need.weeklyCapacityKg - need.usedThisWeekKg)
  const maxKg = Math.min(availableKg, need.maxKg, weeklyLeft)
  if (weeklyLeft < need.minKg) block("weekly_capacity_full", "Sin capacidad disponible esta semana.")
  else if (availableKg < need.minKg) block("below_minimum", `Mínimo ${need.minKg} kg por operación.`)

  if (weeklyEnd(need.receiving, resource.pickupWindow.start) === null) block("closed_that_day", "No recibe ese día.")

  const eta = etaMinutes(resource.location, dest.location, Math.max(now, resource.pickupWindow.start))
  const zone = zoneFor(network.area, eta)
  // ICC bands (jor, 2026-11-01): alto → food banks and large kitchens; medio → same-day kitchens and
  // shelters close by; bajo → out of the food route, to transformation or compost.
  const band = resource.icc?.band
  if (need.tier === "people" && band && band !== "pendiente") {
    const takes = need.iccBands ?? ["alto", "medio"]
    if (band === "bajo") block("icc_band_bajo", `icc ${resource.icc!.score ?? ""} (banda baja): fuera de la ruta de alimentos.`)
    else if (!takes.includes(band)) block("icc_band_not_accepted", `Solo recibe lotes de banda ${takes.join(" o ")}; este lote es banda ${band}.`)
    else if (band === "medio" && zone !== "a") block("icc_medio_far", `Banda media: vida útil corta, solo destinos cercanos (zona a, ≤ ${network.area.zoneAMaxMinutes} min).`)
  }
  if (zone === "c") block("out_of_zone", `${eta} min de traslado: fuera de la zona operativa; solo con una extensión logística confirmada.`)

  let deliveryModes: DeliveryMode[] = []
  if (blocks.length === 0) {
    const { quotes, blocks: why } = deliveryOptions(resource, dest, network.vehicles, Math.max(need.minKg, Math.min(maxKg, availableKg)), now, zone)
    deliveryModes = [...new Set(quotes.map((q) => q.mode))]
    if (!deliveryModes.length) block("no_logistics", why[0]?.message ?? "No hay forma viable de mover el recurso a tiempo.")
  }

  const eligible = blocks.length === 0
  const score = eligible ? Math.round((1 - (eta / network.area.zoneBMaxMinutes) * 0.6 + Math.min(1, maxKg / Math.max(availableKg, 1)) * 0.4) * 100) / 100 : 0
  return { participantId: dest.id, name: dest.name, tier: need.tier, eligible, blocks, zone, etaMinutes: eta, roadKm: roadKm(resource.location, dest.location), maxKg: Math.max(0, maxKg), deliveryModes, score }
}

export function destinations(network: Network): Participant[] {
  return network.participants.filter((p) => p.need)
}

/** Every destination evaluated, eligible first, by tier then score. */
export function matchResource(resource: Resource, network: Network, availableKg: number, now: Ms): Match[] {
  return destinations(network)
    .map((d) => evaluateDestination(resource, d, network, availableKg, now))
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || b.score - a.score || a.etaMinutes - b.etaMinutes)
}

/** First tier, not yet passed, with at least one eligible destination. */
export function allocateTier(matches: Match[], passed: Tier[]): Tier | null {
  return TIERS.find((t) => !passed.includes(t) && matches.some((m) => m.tier === t && m.eligible)) ?? null
}
