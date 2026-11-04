import assert from "node:assert/strict"
import { test } from "node:test"

import { localJudge } from "../lib/agent/judge.ts"
import { createScriptedPlanner } from "../lib/agent/planner.ts"
import type { AgentDeps } from "../lib/agent/tools.ts"
import { extractLocally } from "../lib/meta/meta.ts"
import { computeImpact, givenFromOffer, receivedFromMission } from "../lib/impact/compute.ts"
import { inboxFor, tickOffer } from "../lib/offers/inbox.ts"
import { createMemoryMissionStore, ensureMission, expireMissedPickups, scanByToken, type Mission, type MissionStore } from "../lib/offers/missions.ts"
import { publishOffer, type PublishInput, type PublishWiring } from "../lib/offers/publish.ts"
import { OfferError, answerQuote, availableKg, cancelHold, chooseDeliveryMode, choicesFor, declareWeight, reserveHold } from "../lib/offers/respond.ts"
import { createMemoryOffersStore, type OffersStore } from "../lib/offers/store.ts"
import type { Offer } from "../lib/offers/types.ts"
import { liveNetwork } from "../lib/network/live.ts"

// End-to-end journeys across epics (E3 publish → E4 respond → E5 missions → E7 impact), with the
// real pipeline, the real network engine and a pinned clock. Every step round-trips through the
// memory stores, like consecutive HTTP requests. Authenticated HTTP with real Firebase accounts
// is verified separately in preview.

const TUESDAY = Date.parse("2026-11-03T12:00:00-06:00")
const BREAD = "10 kg de pan fresco en la colonia Roma, recoger antes de las 6 pm."
const SHELLS = "8 kg de cáscara de huevo limpia y seca, sin residuo, no apta para consumo, en la colonia Roma, recoger antes de las 3 pm."
const NOQTY = "Pan fresco en la colonia Roma, recoger antes de las 6 pm."
const DONOR = { uid: "uid-a", reg: "reg-a" }

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
    message: BREAD, photos: [], donorUid: DONOR.uid, donorRegId: DONOR.reg,
    donorName: "fonda roma", donorRegStatus: "verified", confirmEdible: true, now: TUESDAY, ...over,
  }
}

const network = () => liveNetwork()
const stores = () => ({ offers: createMemoryOffersStore(), missions: createMemoryMissionStore() });

async function persistOffer(s: OffersStore, o: Offer): Promise<Offer> {
  await s.saveOffer(o)
  return (await s.getOffer(o.id))!
}

async function persistMission(s: MissionStore, m: Mission): Promise<Mission> {
  await s.saveMission(m)
  return (await s.getMission(m.id))!
}

async function assertOfferError(p: Promise<unknown>, code: string, status: number): Promise<void> {
  await assert.rejects(p, (e: unknown) => e instanceof OfferError && e.code === code && e.status === status)
}

function sync<T>(fn: () => T): Promise<T> {
  return Promise.resolve().then(fn)
}

test("E2E-01: bread goes donor → wave → hold → pickup → scan → verified impact", async () => {
  const s = stores()
  // Publish: the lot opens with people tier and notifies the first wave.
  let offer = await persistOffer(s.offers, await publishOffer(input(), wiring()))
  assert.equal(offer.tier, "people")
  assert.deepEqual(offer.notifiedIds, ["rec-doctores"])
  // Inbox: the receiver sees its match, never the pickup point.
  const [item] = inboxFor([offer], "rec-doctores", network(), TUESDAY)
  assert.equal(item.myMatch?.tier, "people")
  assert.equal(item.offer.location, null)
  assert.deepEqual(inboxFor([offer], "cmp-guerrero", network(), TUESDAY), [])
  // Hold 5 of 10; more than is left is refused.
  offer = await persistOffer(s.offers, reserveHold(offer, "rec-doctores", 5, TUESDAY, network()))
  assert.equal(availableKg(offer.case!), 5)
  await assertOfferError(sync(() => reserveHold(offer, "rec-doctores", 6, TUESDAY, network())), "over_available", 409)
  await assertOfferError(sync(() => reserveHold(offer, "cmp-guerrero", 2, TUESDAY, network())), "not_notified", 403)
  // Pickup schedules free with a handoff code and opens the mission.
  const rid = offer.case!.reservations[0].id
  assert.ok(choicesFor(offer, "rec-doctores", rid, TUESDAY, network()).some((q) => q.mode === "pickup"))
  offer = await persistOffer(s.offers, chooseDeliveryMode(offer, "rec-doctores", rid, "pickup", null, TUESDAY, network()))
  assert.equal(offer.case!.reservations[0].status, "scheduled")
  let mission = (await ensureMission(s.missions, offer, offer.case!.reservations[0], "uid-b"))!
  mission = await persistMission(s.missions, mission)
  // Only the holder scans; strangers and the donor are refused, unknown codes stay 404.
  const all = await s.missions.listMissionsByOffer(offer.id)
  await assertOfferError(sync(() => scanByToken(offer, all, mission.token, "uid-a", "reg-a", 5, TUESDAY, network())), "wrong_user", 403)
  await assertOfferError(sync(() => scanByToken(offer, all, "0000000000000000", "uid-b", "rec-doctores", 5, TUESDAY, network())), "wrong_code", 404)
  const scanned = scanByToken(offer, all, mission.token, "uid-b", "rec-doctores", 5, TUESDAY, network())
  assert.equal(scanned.repeated, false)
  offer = await persistOffer(s.offers, scanned.offer)
  mission = await persistMission(s.missions, scanned.mission)
  assert.equal(offer.case!.reservations[0].status, "delivered")
  assert.equal(mission.status, "completed")
  const again = scanByToken(offer, [mission], mission.token, "uid-b", "rec-doctores", 5, TUESDAY, network())
  assert.equal(again.repeated, true)
  // Impact counts the verified 5 kg on both sides, with documented estimates.
  const impact = computeImpact(givenFromOffer(offer), receivedFromMission(mission, offer))
  assert.equal(impact.givenKg, 5)
  assert.equal(impact.receivedKg, 5)
  assert.equal(impact.co2kg, 10 * 4.0)
  assert.equal(impact.waterL, 10 * 190)
})

test("E2E-02: a missed pickup cascades to compost and still closes verified", async () => {
  const s = stores()
  let offer = await persistOffer(s.offers, await publishOffer(input(), wiring()))
  offer = await persistOffer(s.offers, reserveHold(offer, "rec-doctores", 5, TUESDAY, network()))
  const rid = offer.case!.reservations[0].id
  offer = await persistOffer(s.offers, chooseDeliveryMode(offer, "rec-doctores", rid, "pickup", null, TUESDAY, network()))
  let missionA = (await ensureMission(s.missions, offer, offer.case!.reservations[0], "uid-b"))!
  // Wednesday morning: the evening pickup never happened. The lot returns to the cascade.
  const late = TUESDAY + 21 * 3600_000
  const expired = expireMissedPickups(offer, [missionA], late, network())
  offer = await persistOffer(s.offers, expired.offer)
  missionA = await persistMission(s.missions, expired.missions[0])
  assert.equal(missionA.status, "expired")
  assert.equal(availableKg(offer.case!), 10)
  assert.ok(offer.notifiedIds.includes("cmp-guerrero"))
  await assertOfferError(sync(() => scanByToken(offer, [missionA], missionA.token, "uid-b", "rec-doctores", 5, late, network())), "mission_expired", 409)
  // Compost takes the whole lot with its own courier and closes with 9 of 10 verified.
  offer = await persistOffer(s.offers, reserveHold(offer, "cmp-guerrero", 10, late, network()))
  const ridB = offer.case!.reservations.find((r) => r.participantId === "cmp-guerrero")!.id
  const choices = choicesFor(offer, "cmp-guerrero", ridB, late, network())
  const own = choices.find((q) => q.mode === "own_courier")
  assert.ok(own, "compost collects with its own courier")
  offer = await persistOffer(s.offers, chooseDeliveryMode(offer, "cmp-guerrero", ridB, "own_courier", null, late, network()))
  let missionB = (await ensureMission(s.missions, offer, offer.case!.reservations.find((r) => r.id === ridB)!, "uid-c"))!
  const scanned = scanByToken(offer, [missionA, missionB], missionB.token, "uid-c", "cmp-guerrero", 9, late, network())
  offer = await persistOffer(s.offers, scanned.offer)
  missionB = await persistMission(s.missions, scanned.mission)
  assert.equal(missionB.receivedKg, 9)
  // Impact: 9 diverted kilos, no CO2 claimed outside people tier.
  const impact = computeImpact(givenFromOffer(offer), receivedFromMission(missionB, offer))
  assert.equal(impact.givenKg, 9)
  assert.equal(impact.receivedKg, 9)
  assert.equal(impact.divertedKg, 18)
  assert.equal(impact.co2kg, 0)
  // The 1 kg shortfall stays allocated to the delivered hold (shrinkage), so nothing is left.
  assert.equal(availableKg(offer.case!), 0)
})

test("E2E-03: inedible organics reach a maker, never people", async () => {
  const s = stores()
  let offer = await persistOffer(s.offers, await publishOffer(input({ message: SHELLS, confirmEdible: false }), wiring()))
  assert.equal(offer.tier, "transformation")
  assert.deepEqual(offer.notifiedIds, ["mak-cascara"])
  assert.ok(!offer.eligible.some((e) => e.tier === "people"))
  assert.deepEqual(inboxFor([offer], "rec-doctores", network(), TUESDAY), [])
  const [item] = inboxFor([offer], "mak-cascara", network(), TUESDAY)
  assert.equal(item.myMatch?.tier, "transformation")
  offer = await persistOffer(s.offers, reserveHold(offer, "mak-cascara", 5, TUESDAY, network()))
  const rid = offer.case!.reservations[0].id
  offer = await persistOffer(s.offers, chooseDeliveryMode(offer, "mak-cascara", rid, "pickup", null, TUESDAY, network()))
  let mission = (await ensureMission(s.missions, offer, offer.case!.reservations[0], "uid-d"))!
  const scanned = scanByToken(offer, [mission], mission.token, "uid-d", "mak-cascara", 5, TUESDAY, network())
  offer = await persistOffer(s.offers, scanned.offer)
  mission = await persistMission(s.missions, scanned.mission)
  assert.equal(offer.case!.reservations[0].status, "delivered")
  const impact = computeImpact(givenFromOffer(offer), receivedFromMission(mission, offer))
  assert.equal(impact.divertedKg, 10)
  assert.equal(impact.co2kg, 0)
})

test("E2E-04: a weightless lot holds nothing until the donor weighs it, then closes whole", async () => {
  const s = stores()
  let offer = await persistOffer(s.offers, await publishOffer(input({ message: NOQTY }), wiring()))
  assert.equal(offer.case?.status, "no_destination")
  assert.deepEqual(offer.notifiedIds, [])
  await assertOfferError(sync(() => reserveHold(offer, "rec-doctores", 5, TUESDAY, network())), "not_open", 409)
  offer = await persistOffer(s.offers, declareWeight(offer, "uid-a", 10, TUESDAY, network()))
  assert.deepEqual(offer.notifiedIds, ["rec-doctores"])
  await assertOfferError(sync(() => declareWeight(offer, "uid-b", 12, TUESDAY, network())), "not_donor", 403)
  offer = await persistOffer(s.offers, reserveHold(offer, "rec-doctores", 10, TUESDAY, network()))
  assert.equal(offer.case!.status, "fully_reserved")
  const rid = offer.case!.reservations[0].id
  offer = await persistOffer(s.offers, chooseDeliveryMode(offer, "rec-doctores", rid, "pickup", null, TUESDAY, network()))
  let mission = (await ensureMission(s.missions, offer, offer.case!.reservations[0], "uid-b"))!
  const scanned = scanByToken(offer, [mission], mission.token, "uid-b", "rec-doctores", 10, TUESDAY, network())
  offer = await persistOffer(s.offers, scanned.offer)
  const impact = computeImpact(givenFromOffer(offer), receivedFromMission(scanned.mission, offer))
  assert.equal(impact.givenKg, 10)
  assert.equal(impact.co2kg, 20 * 4.0)
})

test("E2E-05: a second receiver never sees the first hold's data, at any stage", async () => {
  const s = stores()
  const published = await persistOffer(s.offers, await publishOffer(input(), wiring()))
  const at = TUESDAY + 31 * 60_000
  const offer = await persistOffer(s.offers, tickOffer(published, network(), at))
  assert.ok(offer.notifiedIds.includes("cmp-guerrero"))
  const held = await persistOffer(s.offers, reserveHold(offer, "rec-doctores", 5, at, network()))
  const holdId = held.case!.reservations[0].id
  for (const stage of [held]) {
    const [view] = inboxFor([stage], "cmp-guerrero", network(), at)
    const payload = JSON.stringify(view)
    assert.ok(!payload.includes(holdId), "another hold stays invisible")
    assert.ok(!payload.includes(BREAD), "the donor text stays invisible")
    assert.ok(!payload.includes("uid-a") && !payload.includes("reg-a"), "donor ownership stays invisible")
    assert.deepEqual(view.mine, [])
  }
  const rid = held.case!.reservations[0].id
  const scheduled = await persistOffer(s.offers, chooseDeliveryMode(held, "rec-doctores", rid, "pickup", null, at, network()))
  const [committed] = inboxFor([scheduled], "cmp-guerrero", network(), at)
  const payload = JSON.stringify(committed)
  assert.ok(!payload.includes(holdId), "another scheduled hold stays invisible")
  assert.ok(!payload.includes(scheduled.case!.reservations[0].handoffCode!), "another handoff code stays invisible")
  // And the holder's own path still works after being watched: cancel and re-hold.
  const freed = cancelHold(scheduled, "rec-doctores", rid, at, network())
  assert.equal(availableKg(freed.case!), 10)
  const reheld = reserveHold(freed, "cmp-guerrero", 8, at, network())
  assert.equal(availableKg(reheld.case!), 2)
  // A courier quote can be priced and declined without side effects.
  const ridC = reheld.case!.reservations.find((r) => r.participantId === "cmp-guerrero")!.id
  const courier = choicesFor(reheld, "cmp-guerrero", ridC, at, network()).find((q) => q.mode === "courier" || q.mode === "backhaul")
  if (!courier) return
  assert.equal(courier.simulated, true)
  const waiting = chooseDeliveryMode(reheld, "cmp-guerrero", ridC, courier.mode, courier.vehicleId, at, network())
  const back = answerQuote(waiting, "cmp-guerrero", ridC, false, at, network())
  assert.equal(back.case!.reservations.find((r) => r.id === ridC)!.status, "held")
})
