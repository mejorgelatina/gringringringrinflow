import assert from "node:assert/strict"
import { test } from "node:test"

import { localJudge } from "../lib/agent/judge.ts"
import { createScriptedPlanner } from "../lib/agent/planner.ts"
import type { AgentDeps } from "../lib/agent/tools.ts"
import { extractLocally } from "../lib/meta/meta.ts"
import { createMemoryMissionStore, ensureMission, expireMissedPickups, scanByToken, type Mission } from "../lib/offers/missions.ts"
import { publishOffer, type PublishInput, type PublishWiring } from "../lib/offers/publish.ts"
import { OfferError, availableKg, cancelHold, chooseDeliveryMode, reserveHold } from "../lib/offers/respond.ts"
import type { Offer } from "../lib/offers/types.ts"
import { liveNetwork } from "../lib/network/live.ts"

// E5: missions and QR close. A scheduled hold opens a mission with an unguessable token; the
// holder scans it once for pickup plus verified receipt. Offline pipeline, pinned clock.

const TUESDAY = Date.parse("2026-11-03T12:00:00-06:00")
const KG_LOT = "10 kg de pan fresco en la colonia Roma, recoger antes de las 6 pm."
const HOLDER_UID = "uid-b"

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

async function scheduled(): Promise<{ offer: Offer; pid: string; rid: string }> {
  const offer = await publishOffer(input(), wiring())
  const pid = offer.notifiedIds[0]
  assert.equal(pid, "rec-doctores")
  const held = reserveHold(offer, pid, 5, TUESDAY, network())
  const rid = held.case!.reservations[0].id
  const done = chooseDeliveryMode(held, pid, rid, "pickup", null, TUESDAY, network())
  assert.equal(done.case!.reservations[0].status, "scheduled")
  return { offer: done, pid, rid }
}

async function assertOfferError(p: Promise<unknown>, code: string, status: number): Promise<void> {
  await assert.rejects(p, (e: unknown) => e instanceof OfferError && e.code === code && e.status === status)
}

function sync<T>(fn: () => T): Promise<T> {
  return Promise.resolve().then(fn)
}

test("EM-01: scheduling opens a mission; a valid scan completes it with verified receipt", async () => {
  const store = createMemoryMissionStore()
  const { offer, pid } = await scheduled()
  const r = offer.case!.reservations[0]
  const mission = await ensureMission(store, offer, r, HOLDER_UID)
  assert.ok(mission)
  assert.equal(mission.status, "active")
  assert.match(mission.token, /^[0-9a-f]{16}$/)
  assert.ok(!mission.token.includes(r.id), "the token must not derive from the reservation id")
  assert.equal(mission.holderRegId, pid)
  const out = scanByToken(offer, [mission], mission.token, HOLDER_UID, pid, 5, TUESDAY, network())
  assert.equal(out.repeated, false)
  assert.equal(out.mission.status, "completed")
  assert.equal(out.mission.receivedKg, 5)
  assert.ok(out.mission.scannedAt)
  const done = out.offer.case!.reservations[0]
  assert.equal(done.status, "delivered")
  assert.equal(done.receivedKg, 5)
  assert.ok(done.receivedAt && done.pickedUpAt)
  assert.equal(availableKg(out.offer.case!), 5)
})

test("EM-02: a repeated scan returns the same completion without touching state", async () => {
  const store = createMemoryMissionStore()
  const { offer, pid } = await scheduled()
  const mission = (await ensureMission(store, offer, offer.case!.reservations[0], HOLDER_UID))!
  const first = scanByToken(offer, [mission], mission.token, HOLDER_UID, pid, 4, TUESDAY, network())
  assert.equal(first.mission.receivedKg, 4)
  const events = first.offer.case!.events.length
  const second = scanByToken(first.offer, first.missions, mission.token, HOLDER_UID, pid, 4, TUESDAY, network())
  assert.equal(second.repeated, true)
  assert.equal(second.mission.receivedKg, 4)
  assert.equal(second.offer, first.offer)
  assert.equal(second.offer.case!.events.length, events)
})

test("EM-03: an unknown code scans nothing", async () => {
  const store = createMemoryMissionStore()
  const { offer, pid } = await scheduled()
  const mission = (await ensureMission(store, offer, offer.case!.reservations[0], HOLDER_UID))!
  await assertOfferError(
    sync(() => scanByToken(offer, [mission], "deadbeefdeadbeef", HOLDER_UID, pid, 5, TUESDAY, network())),
    "wrong_code", 404,
  )
})

test("EM-04: only the holder scans, never the donor or a stranger", async () => {
  const store = createMemoryMissionStore()
  const { offer, pid } = await scheduled()
  const mission = (await ensureMission(store, offer, offer.case!.reservations[0], HOLDER_UID))!
  await assertOfferError(
    sync(() => scanByToken(offer, [mission], mission.token, "uid-a", "reg-a", 5, TUESDAY, network())),
    "wrong_user", 403,
  )
  await assertOfferError(
    sync(() => scanByToken(offer, [mission], mission.token, "uid-c", "reg-c", 5, TUESDAY, network())),
    "wrong_user", 403,
  )
})

test("EM-05: the receipt cannot exceed what was held", async () => {
  const store = createMemoryMissionStore()
  const { offer, pid } = await scheduled()
  const mission = (await ensureMission(store, offer, offer.case!.reservations[0], HOLDER_UID))!
  await assertOfferError(
    sync(() => scanByToken(offer, [mission], mission.token, HOLDER_UID, pid, 6, TUESDAY, network())),
    "bad_quantity", 400,
  )
  await assertOfferError(
    sync(() => scanByToken(offer, [mission], mission.token, HOLDER_UID, pid, 0, TUESDAY, network())),
    "bad_quantity", 400,
  )
})

test("EM-06: a missed pickup returns the lot to the cascade with a fresh window", async () => {
  const store = createMemoryMissionStore()
  const { offer, pid } = await scheduled()
  const mission = (await ensureMission(store, offer, offer.case!.reservations[0], HOLDER_UID))!
  assert.equal(new Date(mission.windowEnd - 6 * 3600_000).toISOString().slice(11, 16), "18:00")
  const late = TUESDAY + 21 * 3600_000 // wednesday 09:00: the evening pickup never happened
  const out = expireMissedPickups(offer, [mission], late, network())
  assert.notEqual(out.offer, offer)
  assert.equal(out.missions[0].status, "expired")
  assert.equal(out.offer.case!.reservations[0].status, "expired")
  assert.equal(availableKg(out.offer.case!), 10)
  assert.equal(out.offer.case!.status, "open")
  assert.equal(out.offer.case!.resource.pickupWindow.end, late + 24 * 3600_000)
  assert.ok(out.offer.case!.events.some((e) => e.type === "pickup_missed"))
  assert.ok(out.offer.case!.waves.length >= 2, "the waves resume after the missed pickup")
  assert.ok(out.offer.notifiedIds.includes("cmp-guerrero"), "the lot cascades to the next tier")
  // Scanning now reports the expiry instead of completing.
  await assertOfferError(
    sync(() => scanByToken(out.offer, out.missions, mission.token, HOLDER_UID, pid, 5, late, network())),
    "mission_expired", 409,
  )
})

test("EM-07: a mission on a cancelled hold expires silently", async () => {
  const store = createMemoryMissionStore()
  const { offer, pid } = await scheduled()
  const mission = (await ensureMission(store, offer, offer.case!.reservations[0], HOLDER_UID))!
  const freed = cancelHold(offer, pid, mission.reservationId, TUESDAY, network())
  const out = expireMissedPickups(freed, [mission], TUESDAY, network())
  assert.equal(out.missions[0].status, "expired")
  assert.equal(availableKg(out.offer.case!), 10)
  assert.ok(!out.offer.case!.events.some((e) => e.type === "pickup_missed"))
})

test("EM-08: missions open once per scheduled hold, never for the rest", async () => {
  const store = createMemoryMissionStore()
  const { offer } = await scheduled()
  const r = offer.case!.reservations[0]
  const first = (await ensureMission(store, offer, r, HOLDER_UID))!
  const second = await ensureMission(store, offer, r, HOLDER_UID)
  assert.equal(second?.token, first.token)
  assert.equal((await store.listMissionsByOffer(offer.id)).length, 1)
  assert.equal(await ensureMission(store, offer, { ...r, status: "held" }, HOLDER_UID), null)
  assert.equal(await ensureMission(store, { ...offer, case: null }, r, HOLDER_UID), null)
})

test("EM-09: scanning needs a scheduled hold", async () => {
  const published = await publishOffer(input(), wiring())
  const pid = published.notifiedIds[0]
  const held = reserveHold(published, pid, 5, TUESDAY, network())
  const fake: Mission = {
    id: "m_x", offerId: held.id, reservationId: held.case!.reservations[0].id,
    holderUid: HOLDER_UID, holderRegId: pid, donorRegId: "reg-a",
    token: "abcdefabcdefabcd", kg: 5, windowEnd: held.case!.resource.pickupWindow.end,
    createdAt: new Date(TUESDAY).toISOString(), scannedAt: null, receivedKg: null, status: "active",
  }
  await assertOfferError(
    sync(() => scanByToken(held, [fake], fake.token, HOLDER_UID, pid, 5, TUESDAY, network())),
    "bad_state", 400,
  )
})

test("EM-10: the store scopes missions by holder and offer", async () => {
  const store = createMemoryMissionStore()
  const { offer } = await scheduled()
  const mission = (await ensureMission(store, offer, offer.case!.reservations[0], HOLDER_UID))!
  assert.equal((await store.getMissionByToken(mission.token))?.id, mission.id)
  assert.equal((await store.getMissionByToken("nope-nope-nope-00"))?.id ?? null, null)
  assert.deepEqual((await store.listMissionsByHolder(HOLDER_UID)).map((m) => m.id), [mission.id])
  assert.deepEqual(await store.listMissionsByHolder("uid-z"), [])
  assert.deepEqual((await store.listMissionsByOffer(offer.id)).map((m) => m.id), [mission.id])
})
