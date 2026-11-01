import { chooseDelivery, deliveryChoices, publish, reserve } from "./coordinator.ts"
import { DEMO_DAY } from "./demo.ts"
import { liveNetwork } from "./live.ts"
import { matchResource } from "./match.ts"
import type { Block, Condition, Network, Point, Resource, Tier } from "./types.ts"
import { characterize, planningWeight, type IccSupply } from "../icc/characterize.ts"
import type { IccRecord } from "../icc/types.ts"

// Bridge from what intake extracts (a Supply: item, category, quantity + unit, condition, deadline, place name)
// to the resource network. The lot's weight comes from its ICC record (lib/icc/): declared, measured, or
// estimated from a unit reference and labelled as such. A count is never read as kilos. The intake agent, the whatsapp handler and /intake all call `evaluateSupply`,
// so every channel answers with the same engine as /network. The candidate shape is the one those
// surfaces already render: one row per destination and transport option, feasible or with its blockers.

/** Same shape as the ICC input: the network reads weight from the ICC record, never from a raw count. */
export type SupplyLike = IccSupply & {
  condition: Condition
  /** Exact pickup point (a whatsapp location pin, or the donor's registered address). Wins over the place name. */
  point?: Point | null
  /** A registered donor; its impact zone then applies. Unregistered senders are "intake-donor". */
  donorId?: string | null
}

export type LegacyTier = "people" | "transformation" | "valorization"

export type Candidate = {
  recipientId: string
  recipient: string
  tier: LegacyTier
  capacityId: string
  capacity: string
  routeKm: number | null
  routeSource: string
  feasible: boolean
  blockers: { code: string; label: string }[]
  costMxn: number | null
  zone: string | null
  etaMinutes: number | null
  /** Not blocking, but shown: e.g. the weight is an estimate until someone weighs it. */
  warnings?: { code: string; label: string }[]
}

/** Route names used by the agent and its checks. Compost is the existing "valorization" route. */
export const TIER_ORDER: LegacyTier[] = ["people", "transformation", "valorization"]
const LEGACY: Record<Tier, LegacyTier> = { people: "people", transformation: "transformation", compost: "valorization" }

/**
 * Pilot-area places intake recognizes, with a representative point. Unknown places are not guessed.
 * The added names and approximate representative points are based on the public CDMX colony
 * catalog: https://datos.cdmx.gob.mx/dataset/catalogo-de-colonias-datos-abiertos
 */
export const PLACES: Record<string, Point> = {
  roma: { lat: 19.4194, lng: -99.1617 },
  "roma norte": { lat: 19.4194, lng: -99.1617 },
  "roma sur": { lat: 19.408, lng: -99.165 },
  condesa: { lat: 19.412, lng: -99.171 },
  centro: { lat: 19.4326, lng: -99.1332 },
  doctores: { lat: 19.4167, lng: -99.1453 },
  juarez: { lat: 19.4285, lng: -99.1565 },
  narvarte: { lat: 19.396, lng: -99.156 },
  "del valle": { lat: 19.389, lng: -99.163 },
  guerrero: { lat: 19.44, lng: -99.15 },
  polanco: { lat: 19.433, lng: -99.194 },
  anzures: { lat: 19.428, lng: -99.177 },
  "san rafael": { lat: 19.437, lng: -99.161 },
  "santa maria la ribera": { lat: 19.453, lng: -99.163 },
  escandon: { lat: 19.404, lng: -99.184 },
  "san miguel chapultepec": { lat: 19.411, lng: -99.189 },
  mixcoac: { lat: 19.375, lng: -99.191 },
  portales: { lat: 19.358, lng: -99.144 },
  alamos: { lat: 19.403, lng: -99.141 },
  "del carmen": { lat: 19.35, lng: -99.163 },
  coyoacan: { lat: 19.35, lng: -99.162 },
  lindavista: { lat: 19.49, lng: -99.132 },
  tacuba: { lat: 19.459, lng: -99.221 },
  "san pedro de los pinos": { lat: 19.386, lng: -99.192 },
  "lomas de chapultepec": { lat: 19.426, lng: -99.211 },
}

const norm = (s: string) => s.toLocaleLowerCase("es-MX").normalize("NFD").replace(/[̀-ͯ]/g, "").trim()

export function placePoint(location: string | null): Point | null {
  if (!location) return null
  const key = norm(location).replace(/^(la )?colonia /, "")
  return PLACES[key] ?? Object.entries(PLACES).find(([k]) => key.includes(k))?.[1] ?? null
}

/** Material specs a maker can require, read from what the donor wrote. Only explicit words count. */
export function detectAttributes(text: string): string[] {
  const t = norm(text)
  const out: string[] = []
  if (/\b(limpi[ao]s?|lavad[ao]s?)\b/.test(t)) out.push("limpia")
  if (/\bsec[ao]s?\b/.test(t)) out.push("seca")
  if (/sin (residuo|restos)/.test(t)) out.push("sin residuo")
  if (/\bmolid[ao]s?\b/.test(t)) out.push("molida")
  if (/\bseparad[ao]s?\b/.test(t)) out.push("separada")
  return out
}

const hour = (h: number) => Date.parse(`${DEMO_DAY}T${String(h).padStart(2, "0")}:00:00-06:00`)

/** A resource for the network, or the input gaps that stop one from being built. Weight comes from ICC. */
export function supplyToResource(supply: SupplyLike, text = "", icc?: IccRecord): { resource: Resource | null; gaps: Block[]; icc: IccRecord; warnings: Block[] } {
  const record = icc ?? characterize({ channel: "network", text, supply })
  const gaps: Block[] = []
  const warnings: Block[] = []
  const weight = planningWeight(record)
  const { count } = record.physical
  if (!count && !record.physical.weightKg) gaps.push({ code: "quantity_unknown", message: "Quantity pending confirmation" })
  if (supply.quantityBasis === "estimated" || count?.provenance === "estimado") gaps.push({ code: "quantity_estimated", message: supply.quantitySource === "foto" ? "Count read off the photo; the donor must confirm it" : "Quantity is estimated; confirmation required" })
  if (count && !record.physical.weightKg) gaps.push({ code: "weight_unknown", message: `Weight unknown: no reference for "${count.value.unit}" of this product. Ask the donor or weigh it` })
  else if (record.physical.weightKg && !weight) gaps.push({ code: "weight_estimated", message: "Weight is only estimated and the planning policy needs a declared or measured weight" })
  else if (weight?.provenance === "estimado") warnings.push({ code: "weight_estimated", message: `Weight estimated ${Math.round(weight.range.min)}–${Math.round(weight.range.max)} kg (${record.physical.weightKg!.method}); confirm on a scale at handoff` })
  const point = supply.point ?? placePoint(supply.location)
  if (!supply.location && !supply.point) gaps.push({ code: "pickup_location_unknown", message: "Pickup location pending confirmation" })
  else if (!point) gaps.push({ code: "route_unverified", message: `"${supply.location}" is outside the pilot area or not recognized; a person must place it` })
  if (!Number.isFinite(supply.deadlineHour)) gaps.push({ code: "deadline_unknown", message: "Deadline pending confirmation" })
  const deadline = supply.deadlineHour ?? 18
  const resource: Resource = {
    id: "intake",
    donorId: supply.donorId ?? "intake-donor",
    title: supply.item ?? supply.category ?? "lote",
    item: supply.item ?? "",
    category: supply.category ?? "",
    kg: weight?.kg ?? 0,
    ...(count ? { units: { count: count.value.count, unit: count.value.unit } } : {}),
    condition: supply.condition,
    conditionConfirmed: supply.condition !== "unknown",
    attributes: detectAttributes(`${supply.item ?? ""} ${text}`),
    location: point ?? { lat: 0, lng: 0 },
    pickupWindow: { start: hour(Math.max(0, deadline - 3)), end: hour(deadline) },
    refrigerationNeeded: false,
    icc: { score: record.composite.score, band: record.composite.band },
  }
  return { resource, gaps, icc: record, warnings }
}

/** Every destination in the network for this supply: one row per viable transport option, or one blocked row. */
export function evaluateSupply(supply: SupplyLike, text = "", network: Network = liveNetwork()): Candidate[] {
  const { resource, gaps, icc, warnings } = supplyToResource(supply, text)
  const r = resource!
  const at = r.pickupWindow.start
  const gapRows = gaps.map((g) => ({ code: g.code, label: g.message }))
  const warningRows = warnings.map((w) => ({ code: w.code, label: w.message }))
  // ICC eligibility the engine does not know about yet (e.g. perishables with no storage declared).
  const peopleIcc = icc.eligibility.people
  const iccPeopleBlock = peopleIcc.status === "condicionado" && supply.condition === "edible" ? [{ code: "icc_people_conditional", label: `${peopleIcc.reasons.join("; ")}: ${peopleIcc.needs.join("; ")}` }] : []
  const rows: Candidate[] = []
  for (const m of matchResource(r, network, r.kg || 1, at)) {
    const blockers = [...gapRows, ...m.blocks.map((b) => ({ code: b.code === "not_safe_for_people" ? "condition_not_safe_for_people" : b.code, label: b.message })), ...(m.tier === "people" && m.eligible ? iccPeopleBlock : [])]
    // A destination that can take part of the lot is still a valid proposal: it holds what it can and the
    // rest goes to the next wave (openOperation reserves min(kg, maxKg)). This is how one lot is split.
    const partial = m.eligible && r.kg > m.maxKg ? [{ code: "partial_capacity", label: `Takes up to ${m.maxKg} kg of ~${Math.round(r.kg)} kg; the rest is offered to the next wave` }] : []
    const base = { recipientId: m.participantId, recipient: m.name, tier: LEGACY[m.tier], zone: m.zone, etaMinutes: m.etaMinutes, warnings: [...warningRows, ...partial] }
    const quotes = m.eligible && gaps.every((g) => g.code === "quantity_estimated") ? optionsFor(r, m.participantId, network) : []
    if (!quotes.length) {
      rows.push({ ...base, capacityId: "none", capacity: "no transport option evaluated", routeKm: null, routeSource: "unverified", feasible: false, blockers: blockers.length ? blockers : [{ code: "no_logistics", label: "No viable way to move it in time" }], costMxn: null })
      continue
    }
    for (const q of quotes) {
      rows.push({
        ...base,
        capacityId: q.mode === "own_courier" ? "own-courier" : q.vehicleId ?? "pickup",
        capacity: q.mode === "pickup" ? `${m.name} picks up · free` : q.mode === "own_courier" ? `${m.name} sends its own courier (uber or similar) and pays it` : q.mode === "courier" ? `${q.label} · quote $${q.costMxn} mxn paid by the receiver · simulated` : `${q.label} · return trip, ${q.detourKm} km detour, $${q.costMxn} mxn · simulated`,
        routeKm: q.roadKm,
        routeSource: "straight_line_estimate",
        feasible: blockers.length === 0,
        blockers,
        costMxn: q.costMxn,
      })
    }
  }
  return rows.sort((a, b) => Number(b.feasible) - Number(a.feasible) || TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || (a.costMxn ?? 999) - (b.costMxn ?? 999))
}

function optionsFor(resource: Resource, participantId: string, network: Network) {
  // Open a throwaway case so delivery options come from the same code the coordinator uses.
  const c = publish(resource, network, resource.pickupWindow.start)
  const res = { ...c, reservations: [{ id: "probe", participantId, tier: "people" as const, kg: resource.kg, createdAt: resource.pickupWindow.start, holdUntil: null, status: "held" as const, quote: null, quoteAcceptedAt: null, capacityConfirmedAt: null, handoffCode: null, pickedUpAt: null, receivedKg: null, receivedAt: null, stopReason: null }] }
  return deliveryChoices(res, network, "probe", resource.pickupWindow.start)
}

export type OperationSummary = {
  recipientId: string
  kg: number
  /** How the held kg is known. An estimate stays labelled until the handoff or receipt measures it. */
  kgProvenance: string
  remainingKg: number
  mode: "pickup" | "own_courier" | "courier" | "backhaul"
  costMxn: number
  status: string
  handoffCode: string | null
  holdUntil: string | null
  nextStep: string
  notified: string[]
}

/**
 * After an operator approves the agent's proposal: open the operation in the network. The proposed
 * destination holds the lot (partially, if it can't take it all) and the chosen delivery is recorded.
 * Pickup is confirmed at once with a handoff code; a courier or backhaul still waits for the receiver
 * to accept the cost and the carrier to confirm capacity. Nothing is dispatched.
 */
export function openOperation(supply: SupplyLike, text: string, recipientId: string, capacityId: string, network: Network = liveNetwork()): OperationSummary | null {
  const { resource, gaps, icc } = supplyToResource(supply, text)
  if (!resource || gaps.length) return null
  const at = resource.pickupWindow.start
  let c = publish(resource, network, at)
  if (!c.waves.some((w) => w.notified.includes(recipientId))) {
    c = { ...c, waves: [...c.waves, { n: c.waves.length + 1, tier: c.activeTier ?? "people", at, notified: [recipientId] }] }
  }
  const match = matchResource(resource, network, resource.kg, at).find((m) => m.participantId === recipientId)
  if (!match?.eligible) return null
  c = reserve(c, network, recipientId, Math.min(resource.kg, match.maxKg), at)
  const id = c.reservations[0].id
  const vehicle = network.vehicles.find((v) => v.id === capacityId)
  const mode = capacityId === "pickup" ? "pickup" : capacityId === "own-courier" ? "own_courier" : vehicle?.kind === "route" ? "backhaul" : "courier"
  c = chooseDelivery(c, network, id, mode, at, vehicle?.id ?? null)
  const r = c.reservations[0]
  const clock = (ms: number | null) => (ms === null ? null : new Date(ms - 6 * 3600_000).toISOString().slice(11, 16))
  return {
    recipientId, kg: r.kg, kgProvenance: icc.physical.weightKg?.provenance ?? "desconocido", remainingKg: resource.kg - r.kg, mode, costMxn: r.quote!.costMxn, status: r.status, handoffCode: r.handoffCode,
    holdUntil: clock(r.holdUntil),
    nextStep: mode === "pickup" ? `pickup code ${r.handoffCode}; the receiver collects it` : mode === "own_courier" ? `pickup code ${r.handoffCode}; the receiver sends its own courier with it` : `the receiver accepts $${r.quote!.costMxn} mxn, then the carrier confirms capacity`,
    notified: c.waves.flatMap((w) => w.notified),
  }
}
