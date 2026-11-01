import { allocateTier, matchResource } from "./match.ts"
import { distanceKm, localMidnight } from "./zones.ts"
import { TIERS, type Ms, type Network, type Participant, type Resource, type ResourceStream, type Tier } from "./types.ts"

// Three territorial ideas, kept apart on purpose:
//  - impact zone: the radius around a generator where grinflow looks for who could use what it generates (discovery);
//  - service area: where a viable operation can actually happen (eta, windows, capacity, logistics: the matching engine);
//  - network coverage: the share of what generators produce that has a viable route today.
// A new hotel or supermarket does not just add a user: it activates a territory, and coverage shows how much of it the network can serve.

export type StreamCoverage = {
  generatorId: string
  generator: string
  stream: ResourceStream
  lotKg: number
  tier: Tier | null
  destinations: string[]
  reason: string | null
}

export type GeneratorCoverage = {
  id: string
  name: string
  impactRadiusKm: number
  /** Destinations inside the impact zone, whatever they accept. */
  discovered: string[]
  kgPerWeek: number
  coveredKgPerWeek: number
}

export type Coverage = {
  streams: StreamCoverage[]
  generators: GeneratorCoverage[]
  totalKgPerWeek: number
  coveredKgPerWeek: number
  pct: number
  byTier: Record<Tier, number>
}

const FIT = ["category_not_accepted", "material_not_accepted", "condition_not_accepted", "not_safe_for_people", "specs_not_met"]

const PER_WEEK = { diaria: 7, semanal: 1, eventual: 1 }

export function streamResource(g: Participant, s: ResourceStream, day: Ms): Resource {
  const midnight = localMidnight(day)
  const lotKg = Math.round((s.kgPerWeek / PER_WEEK[s.frequency]) * 10) / 10
  return {
    id: `${g.id}:${s.id}`, donorId: g.id, title: s.item, item: s.item, category: s.category, material: s.material, kg: lotKg,
    condition: s.condition, conditionConfirmed: s.condition !== "unknown", attributes: s.attributes, location: g.location,
    pickupWindow: { start: midnight + s.typicalWindow.from * 60_000, end: midnight + s.typicalWindow.to * 60_000 }, refrigerationNeeded: false,
  }
}

/** Would each regular stream find a viable destination on `day`? Uses the same engine as live offers. */
export function coverage(network: Network, day: Ms): Coverage {
  const generators = network.participants.filter((p) => p.generator)
  const streams: StreamCoverage[] = generators.flatMap((g) =>
    g.generator!.streams.map((s) => {
      const r = streamResource(g, s, day)
      const matches = matchResource(r, network, r.kg, r.pickupWindow.start)
      const tier = allocateTier(matches, [])
      // Why not: name the closest destination that would take this material, and what stops it.
      const takers = matches.filter((m) => !m.blocks.some((b) => FIT.includes(b.code))).sort((a, b) => a.roadKm - b.roadKm)
      const reason = tier ? null : takers.length ? `${takers[0].name}: ${takers[0].blocks[0].message}` : `nadie en la red recibe ${s.item} en esta condición`
      return { generatorId: g.id, generator: g.name, stream: s, lotKg: r.kg, tier, destinations: matches.filter((m) => m.eligible && m.tier === tier).map((m) => m.name), reason }
    }),
  )
  const byTier = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<Tier, number>
  for (const s of streams) if (s.tier) byTier[s.tier] += s.stream.kgPerWeek
  const totalKgPerWeek = streams.reduce((a, s) => a + s.stream.kgPerWeek, 0)
  const coveredKgPerWeek = streams.filter((s) => s.tier).reduce((a, s) => a + s.stream.kgPerWeek, 0)
  return {
    streams,
    generators: generators.map((g) => {
      const mine = streams.filter((s) => s.generatorId === g.id)
      return {
        id: g.id, name: g.name, impactRadiusKm: g.generator!.impactRadiusKm,
        discovered: network.participants.filter((p) => p.need && distanceKm(g.location, p.location) <= g.generator!.impactRadiusKm).map((p) => p.id),
        kgPerWeek: mine.reduce((a, s) => a + s.stream.kgPerWeek, 0),
        coveredKgPerWeek: mine.filter((s) => s.tier).reduce((a, s) => a + s.stream.kgPerWeek, 0),
      }
    }),
    totalKgPerWeek,
    coveredKgPerWeek,
    pct: totalKgPerWeek ? Math.round((coveredKgPerWeek / totalKgPerWeek) * 100) : 0,
    byTier,
  }
}
