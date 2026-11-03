import assert from "node:assert/strict"
import { test } from "node:test"

import { localJudge } from "../lib/agent/judge.ts"
import { createScriptedPlanner } from "../lib/agent/planner.ts"
import type { AgentDeps } from "../lib/agent/tools.ts"
import { extractLocally } from "../lib/meta/meta.ts"
import { CO2_FACTOR, WATER_FACTOR } from "../lib/impact/factors.ts"
import { computeImpact, givenFromOffer, receivedFromMission } from "../lib/impact/compute.ts"
import { createMemoryMissionStore, ensureMission, scanByToken } from "../lib/offers/missions.ts"
import { publishOffer, type PublishInput, type PublishWiring } from "../lib/offers/publish.ts"
import { chooseDeliveryMode, reserveHold } from "../lib/offers/respond.ts"
import type { Offer } from "../lib/offers/types.ts"
import { liveNetwork } from "../lib/network/live.ts"

// E7: own-data impact. Only verified receipt counts; estimates use the documented factors on
// people-tier kilos. The pipeline below drives a real lot all the way to delivered.

const TUESDAY = Date.parse("2026-11-03T12:00:00-06:00")
const KG_LOT = "10 kg de pan fresco en la colonia Roma, recoger antes de las 6 pm."

function wiring(): PublishWiring {
  const deps: AgentDeps = {
    useMeta: false, modelId: null, visionModelId: null,
    extractWithMeta: async () => { throw new Error("no network in tests") },
    extractLocally,
    assessPhotoWithMeta: async () => { throw new Error("no network in tests") },
    judge: localJudge,
  }
  return { intake: deps, agent: deps, planner: createScriptedPlanner() }
}

function input(over: Partial<PublishInput> = {}): PublishInput {
  return {
    message: KG_LOT, photos: [], donorUid: "uid-a", donorRegId: "reg-a",
    donorName: "fonda roma", donorRegStatus: "verified", confirmEdible: true, now: TUESDAY, ...over,
  }
}

const network = () => liveNetwork()

async function delivered(): Promise<{ offer: Offer; missionId: string }> {
  const store = createMemoryMissionStore()
  const published = await publishOffer(input(), wiring())
  const pid = published.notifiedIds[0]
  const held = reserveHold(published, pid, 5, TUESDAY, network())
  const rid = held.case!.reservations[0].id
  const scheduled = chooseDeliveryMode(held, pid, rid, "pickup", null, TUESDAY, network())
  const mission = (await ensureMission(store, scheduled, scheduled.case!.reservations[0], "uid-b"))!
  const out = scanByToken(scheduled, [mission], mission.token, "uid-b", pid, 4, TUESDAY, network())
  return { offer: out.offer, missionId: out.mission.id }
}

test("IM-01: a delivered lot counts verified kilos and estimates on both sides", async () => {
  const { offer } = await delivered()
  const given = givenFromOffer(offer)
  assert.deepEqual(given, [{ kg: 4, tier: "people" }])
  const received = [{ kg: 4, tier: "people" as const }]
  const impact = computeImpact(given, received)
  assert.equal(impact.givenKg, 4)
  assert.equal(impact.receivedKg, 4)
  assert.equal(impact.givenDeliveries, 1)
  assert.equal(impact.co2kg, 4 * 2 * CO2_FACTOR.perKg)
  assert.equal(impact.waterL, 4 * 2 * WATER_FACTOR.perKg)
  assert.equal(impact.divertedKg, 0)
})

test("IM-02: holds and unweighed lots never count", async () => {
  const published = await publishOffer(input(), wiring())
  const held = reserveHold(published, published.notifiedIds[0], 5, TUESDAY, network())
  assert.deepEqual(givenFromOffer(held), [])
  assert.deepEqual(givenFromOffer({ ...held, case: null }), [])
})

test("IM-03: missions count only when completed with a known tier", async () => {
  const { offer } = await delivered()
  const mission = {
    id: "m", offerId: offer.id, reservationId: offer.case!.reservations[0].id,
    holderUid: "uid-b", holderRegId: "x", donorRegId: "reg-a", token: "t",
    kg: 5, windowEnd: 0, createdAt: "", scannedAt: "", receivedKg: 4, status: "completed" as const,
  }
  assert.deepEqual(receivedFromMission(mission, offer), [{ kg: 4, tier: "people" }])
  assert.deepEqual(receivedFromMission({ ...mission, status: "active" }, offer), [])
  assert.deepEqual(receivedFromMission(mission, null), [])
  assert.deepEqual(receivedFromMission(mission, { ...offer, case: null }), [])
})

test("IM-04: transformation and compost divert without co2 claims", () => {
  const impact = computeImpact(
    [{ kg: 10, tier: "compost" }, { kg: 6, tier: "transformation" }],
    [{ kg: 3, tier: "compost" }],
  )
  assert.equal(impact.givenKg, 16)
  assert.equal(impact.receivedKg, 3)
  assert.equal(impact.divertedKg, 19)
  assert.equal(impact.co2kg, 0)
  assert.equal(impact.waterL, 0)
  assert.deepEqual(impact.byTierGiven, { people: 0, transformation: 6, compost: 10 })
})

test("IM-05: empty data is all zeros", () => {
  const impact = computeImpact([], [])
  assert.equal(impact.givenKg, 0)
  assert.equal(impact.receivedKg, 0)
  assert.equal(impact.co2kg, 0)
  assert.equal(impact.waterL, 0)
  assert.equal(impact.divertedKg, 0)
})

test("IM-06: every factor is documented with source and assumptions", () => {
  for (const f of [CO2_FACTOR, WATER_FACTOR]) {
    assert.ok(f.perKg > 0)
    assert.ok(f.unit.length > 0)
    assert.ok(f.source.length > 20, "a real source sentence")
    assert.ok(f.sourceUrl.startsWith("https://"))
    assert.ok(f.assumptions.length >= 2, "assumptions stay explicit")
  }
  assert.ok(CO2_FACTOR.source.includes("WRAP"))
  assert.ok(WATER_FACTOR.source.includes("FAO"))
})
