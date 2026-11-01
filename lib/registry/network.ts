import { setRegisteredParticipants } from "../network/live.ts"
import type { Need, Participant, Role } from "../network/types.ts"
import type { RegistryStore } from "./store.ts"
import type { Registration } from "./types.ts"

// A verified registration becomes a network participant. Defaults below are conservative placeholders a
// person can tighten later; they are named here so nobody mistakes them for something the org declared.

const ALL_FOOD = ["panificados", "verduras", "frutas", "lacteos", "abarrotes", "proteina"]
const DEFAULT_HOURS = { days: [1, 2, 3, 4, 5, 6], from: 9 * 60, to: 18 * 60 }
const DEFAULT_WEEKLY_KG = 100
const SELF_PICKUP_MINUTES = 30

function need(r: Registration): Need | undefined {
  const receiving = r.hours ?? DEFAULT_HOURS
  const weekly = r.accepts?.weeklyKg ?? DEFAULT_WEEKLY_KG
  const base = { minKg: 1, maxKg: Math.max(1, Math.min(weekly, 200)), weeklyCapacityKg: weekly, usedThisWeekKg: 0, receiving, selfPickup: r.selfPickup ?? false, selfPickupMaxMinutes: r.selfPickup ? SELF_PICKUP_MINUTES : 0, notes: "registrado por whatsapp" }
  if (r.roles.includes("receiver")) {
    const cats = r.accepts?.categories.filter((c) => ALL_FOOD.includes(c)) ?? []
    return { ...base, tier: "people", categories: cats.length ? cats : ALL_FOOD, conditions: ["edible"], requires: [] }
  }
  if (r.roles.includes("maker")) {
    const materials = r.accepts?.materials ?? []
    return { ...base, tier: "transformation", categories: ["organico"], ...(materials.length ? { materials } : {}), conditions: ["inedible", "past_prime"], requires: r.accepts?.requires ?? [] }
  }
  if (r.roles.includes("compost")) {
    return { ...base, tier: "compost", categories: [...ALL_FOOD, "organico"], conditions: ["edible", "past_prime", "inedible"], requires: [] }
  }
  return undefined
}

/** Null when it can't take part yet: not verified, or no point on the map (a person must place it). */
export function toParticipant(r: Registration): Participant | null {
  if (r.status !== "verified" || !r.location) return null
  const roles: Role[] = r.roles
  const n = need(r)
  const window = r.hours ?? DEFAULT_HOURS
  return {
    id: r.id,
    name: r.name,
    roles,
    location: r.location,
    area: r.area ?? r.address ?? "",
    verified: true,
    whatsappOptIn: r.whatsappOptIn,
    ...(n ? { need: n } : {}),
    ...(r.roles.includes("donor") ? {
      generator: {
        impactRadiusKm: 5,
        streams: r.generates ? [{ id: "registro", item: r.generates.text.slice(0, 60), category: r.generates.categories[0] ?? "otro", condition: "unknown" as const, attributes: [], kgPerWeek: r.generates.kgPerWeek ?? 0, frequency: r.generates.frequency ?? "eventual", typicalWindow: { from: window.from, to: window.to } }] : [],
      },
    } : {}),
  }
}

/** Load verified registrations into the network every channel evaluates against. */
export async function refreshLiveNetwork(store: RegistryStore): Promise<Participant[]> {
  try {
    const list = (await store.listRegistrations()).map(toParticipant).filter((p): p is Participant => p !== null)
    setRegisteredParticipants(list)
    return list
  } catch (e) {
    console.error("could not load registrations; network runs with the demo participants only", e)
    return []
  }
}
