import assert from "node:assert/strict"
import { test } from "node:test"

import { localJudge } from "../lib/agent/judge.ts"
import { createScriptedPlanner } from "../lib/agent/planner.ts"
import type { AgentDeps } from "../lib/agent/tools.ts"
import { extractLocally } from "../lib/meta/meta.ts"
import { inboxFor, tickOffer } from "../lib/offers/inbox.ts"
import { publishOffer, type PublishInput, type PublishWiring } from "../lib/offers/publish.ts"
import { OfferError, answerQuote, availableKg, cancelHold, choicesFor, chooseDeliveryMode, declareWeight, reserveHold, stopDelivery } from "../lib/offers/respond.ts"
import { createMemoryOffersStore } from "../lib/offers/store.ts"
import type { Offer } from "../lib/offers/types.ts"
import { liveNetwork } from "../lib/network/live.ts"

// E4: receive and respond. Offline pipeline (local extraction, scripted planner) plus the real
// network engine over the demo participants, with a pinned clock. Participant id ==
// registration id; demo receivers stand in for verified organizations.

const TUESDAY = Date.parse("2026-11-03T12:00:00-06:00")
const SUNDAY = Date.parse("2026-11-08T12:00:00-06:00")
const KG_LOT = "10 kg de pan fresco en la colonia Roma, recoger antes de las 6 pm."
const NOQTY_LOT = "Pan fresco en la colonia Roma, recoger antes de las 6 pm."

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

async function kgLot(at: number = TUESDAY): Promise<Offer> {
  const offer = await publishOffer(input({ now: at }), wiring())
  assert.ok(offer.case, "the lot must open a case")
  assert.equal(offer.case?.resource.kg, 10)
  return offer
}

async function assertOfferError(p: Promise<unknown>, code: string, status: number): Promise<void> {
  await assert.rejects(p, (e: unknown) => e instanceof OfferError && e.code === code && e.status === status)
}

function sync(fn: () => Offer): Promise<Offer> {
  return Promise.resolve().then(fn)
}

test("ER-01: waves notify at most three at a time, never twice, ineligible never", async () => {
  const offer = await kgLot()
  const waves = offer.case!.waves
  assert.ok(waves.length >= 1)
  assert.ok(waves[0].notified.length > 0 && waves[0].notified.length <= 3)
  const eligibleIds = new Set(offer.eligible.map((e) => e.participantId))
  for (const id of waves[0].notified) assert.ok(eligibleIds.has(id), `${id} must be eligible`)
  assert.ok(!offer.notifiedIds.includes("mak-cascara"), "a maker is not notified of edible bread")
  // A never-notified participant cannot hold, even from the network.
  await assertOfferError(sync(() => reserveHold(offer, "mak-cascara", 5, TUESDAY, network())), "not_notified", 403)
  // Half an hour later the next slice goes out, disjoint from the first.
  const later = tickOffer(offer, network(), TUESDAY + 31 * 60_000)
  const seen = new Set<string>()
  for (const w of later.case!.waves) {
    assert.ok(w.notified.length <= 3)
    for (const id of w.notified) { assert.ok(!seen.has(id), `${id} notified twice`); seen.add(id) }
  }
  assert.deepEqual([...seen].sort(), [...later.notifiedIds].sort())
})

test("ER-02: partial holds never exceed what is left", async () => {
  const offer = await kgLot()
  // Half an hour passes with no hold: the wave widens past people to compost.
  const at = TUESDAY + 31 * 60_000
  const widened = tickOffer(offer, network(), at)
  const [first, second] = widened.notifiedIds
  assert.ok(first && second, "need two notified receivers across waves")
  const h1 = reserveHold(widened, first, 5, at, network())
  assert.equal(availableKg(h1.case!), 5)
  await assertOfferError(sync(() => reserveHold(h1, second, 10, at, network())), "over_available", 409)
  const h2 = reserveHold(h1, second, 5, at, network())
  assert.equal(availableKg(h2.case!), 0)
  assert.equal(h2.case!.status, "fully_reserved")
  await assertOfferError(sync(() => reserveHold(h2, first, 1, at, network())), "not_open", 409)
})

test("ER-03: holds expire and the kilos return to the lot", async () => {
  const offer = await kgLot()
  const held = reserveHold(offer, offer.notifiedIds[0], 5, TUESDAY, network())
  assert.equal(availableKg(held.case!), 5)
  const expired = tickOffer(held, network(), TUESDAY + 91 * 60_000)
  assert.equal(expired.case!.reservations[0].status, "expired")
  assert.equal(availableKg(expired.case!), 10)
  assert.ok(expired.case!.events.some((e) => e.type === "hold_expired"))
})

test("ER-04: pickup schedules free with a handoff code; courier quotes are simulated", async () => {
  const offer = await kgLot()
  const pid = offer.notifiedIds[0]
  const held = reserveHold(offer, pid, 5, TUESDAY, network())
  const choices = choicesFor(held, pid, held.case!.reservations[0].id, TUESDAY, network())
  assert.ok(choices.length > 0, "the holder must have delivery choices")
  const pickup = choices.find((q) => q.mode === "pickup")
  if (pickup) {
    const done = chooseDeliveryMode(held, pid, held.case!.reservations[0].id, "pickup", null, TUESDAY, network())
    const r = done.case!.reservations[0]
    assert.equal(r.status, "scheduled")
    assert.equal(r.quote?.costMxn, 0)
    assert.match(r.handoffCode ?? "", /^\d{4}$/)
  } else {
    const courier = choices.find((q) => q.mode === "courier" || q.mode === "backhaul")
    assert.ok(courier, "a non-pickup zone must still offer courier")
    assert.equal(courier.simulated, true)
    const waiting = chooseDeliveryMode(held, pid, held.case!.reservations[0].id, courier.mode, courier.vehicleId, TUESDAY, network())
    assert.equal(waiting.case!.reservations[0].status, "awaiting_acceptance")
    const accepted = answerQuote(waiting, pid, waiting.case!.reservations[0].id, true, TUESDAY, network())
    assert.equal(accepted.case!.reservations[0].status, "awaiting_capacity")
  }
})

test("ER-05: declining a quote returns the hold to undecided", async () => {
  const offer = await kgLot()
  const pid = offer.notifiedIds[0]
  const held = reserveHold(offer, pid, 5, TUESDAY, network())
  const choices = choicesFor(held, pid, held.case!.reservations[0].id, TUESDAY, network())
  const courier = choices.find((q) => q.mode === "courier" || q.mode === "backhaul")
  if (!courier) return // pickup-only match: nothing to decline
  const waiting = chooseDeliveryMode(held, pid, held.case!.reservations[0].id, courier.mode, courier.vehicleId, TUESDAY, network())
  const back = answerQuote(waiting, pid, waiting.case!.reservations[0].id, false, TUESDAY, network())
  assert.equal(back.case!.reservations[0].status, "held")
  assert.equal(back.case!.reservations[0].quote, null)
})

test("ER-06: only the holder cancels a hold; the donor cannot", async () => {
  const offer = await kgLot()
  const [first, second] = offer.notifiedIds
  const held = reserveHold(offer, first, 5, TUESDAY, network())
  const rid = held.case!.reservations[0].id
  await assertOfferError(sync(() => cancelHold(held, second, rid, TUESDAY, network())), "not_holder", 403)
  await assertOfferError(sync(() => cancelHold(held, "reg-a", rid, TUESDAY, network())), "not_holder", 403)
  const freed = cancelHold(held, first, rid, TUESDAY, network())
  assert.equal(freed.case!.reservations[0].status, "cancelled")
  assert.equal(availableKg(freed.case!), 10)
})

test("ER-07: the donor stops a handoff in course, never a hold", async () => {
  const offer = await kgLot()
  const pid = offer.notifiedIds[0]
  const held = reserveHold(offer, pid, 5, TUESDAY, network())
  const rid = held.case!.reservations[0].id
  await assertOfferError(sync(() => stopDelivery(held, "reg-a", rid, "llegó otra persona", TUESDAY)), "bad_state", 400)
  await assertOfferError(sync(() => stopDelivery(held, pid, rid, "no soy el donante", TUESDAY)), "not_donor", 403)
  const choices = choicesFor(held, pid, rid, TUESDAY, network())
  const pickup = choices.find((q) => q.mode === "pickup")
  if (!pickup) return // needs a schedulable hold; courier stalls at capacity without a carrier
  const scheduled = chooseDeliveryMode(held, pid, rid, "pickup", null, TUESDAY, network())
  const stopped = stopDelivery(scheduled, "reg-a", rid, "llegó otra persona", TUESDAY)
  assert.equal(stopped.case!.reservations[0].status, "stopped")
  assert.equal(stopped.case!.reservations[0].stopReason, "llegó otra persona")
  assert.ok(stopped.case!.events.some((e) => e.type === "handoff_stopped"))
})

test("ER-08: weightless lots notify nobody until the donor declares weight", async () => {
  const light = await publishOffer(input({ message: NOQTY_LOT }), wiring())
  assert.equal(light.case?.resource.kg, 0)
  assert.equal(light.case?.status, "no_destination")
  assert.deepEqual(light.notifiedIds, [])
  await assertOfferError(sync(() => reserveHold(light, "rec-doctores", 5, TUESDAY, network())), "not_open", 409)
  await assertOfferError(sync(() => declareWeight(light, "uid-b", 18, TUESDAY, network())), "not_donor", 403)
  await assertOfferError(sync(() => declareWeight(light, "uid-a", 0, TUESDAY, network())), "bad_quantity", 400)
  const weighed = declareWeight(light, "uid-a", 10, TUESDAY, network())
  assert.equal(weighed.case?.resource.kg, 10)
  assert.equal(weighed.case?.status, "open")
  assert.ok(weighed.notifiedIds.length > 0)
  assert.ok(weighed.case!.events.some((e) => e.type === "weight_declared"))
  const held = reserveHold(weighed, weighed.notifiedIds[0], 5, TUESDAY, network())
  assert.equal(availableKg(held.case!), 5)
  await assertOfferError(sync(() => declareWeight(held, "uid-a", 12, TUESDAY, network())), "has_reservations", 409)
})

test("ER-09: the inbox hides pickup details until a hold is scheduled", async () => {
  const offer = await kgLot()
  const pid = offer.notifiedIds[0]
  const [item] = inboxFor([offer], pid, network(), TUESDAY)
  assert.ok(item.myMatch, "the notified receiver sees its match")
  assert.equal(item.myMatch?.tier, "people")
  assert.equal(item.offer.location, null)
  assert.equal(item.offer.case?.resource.location, null)
  assert.deepEqual(item.mine, [])
  assert.deepEqual(inboxFor([offer], "mak-cascara", network(), TUESDAY), [])
  const held = reserveHold(offer, pid, 5, TUESDAY, network())
  const rid = held.case!.reservations[0].id
  const choices = choicesFor(held, pid, rid, TUESDAY, network())
  const pickup = choices.find((q) => q.mode === "pickup")
  if (!pickup) return // address reveal needs a schedulable hold
  const scheduled = chooseDeliveryMode(held, pid, rid, "pickup", null, TUESDAY, network())
  const [committed] = inboxFor([scheduled], pid, network(), TUESDAY)
  assert.ok(committed.offer.location, "the scheduled holder sees the pickup address")
  assert.ok(committed.offer.case?.resource.location, "the scheduled holder sees the pickup point")
})

test("ER-10: nobody holds their own offer", async () => {
  const offer = await kgLot()
  await assertOfferError(sync(() => reserveHold(offer, "reg-a", 5, TUESDAY, network())), "own_offer", 403)
})

test("ER-11: windows land on publish day, so holds work any weekday", async () => {
  const offer = await publishOffer(input({ now: SUNDAY }), wiring())
  const day = new Date(offer.case!.resource.pickupWindow.start - 6 * 3600_000).toISOString().slice(0, 10)
  assert.equal(day, "2026-11-08")
  assert.ok(offer.notifiedIds.length > 0, "sunday publishing still notifies everyday receivers")
  const held = reserveHold(offer, offer.notifiedIds[0], 5, SUNDAY, network())
  assert.equal(held.case!.reservations[0].status, "held")
})

test("ER-12: the store finds lots by notified participant", async () => {
  const store = createMemoryOffersStore()
  const a = await kgLot()
  const b = await publishOffer(input({ message: NOQTY_LOT }), wiring())
  await store.saveOffer({ ...a, id: "o1" })
  await store.saveOffer({ ...b, id: "o2" })
  const pid = a.notifiedIds[0]
  const found = await store.listOffersNotified(pid)
  assert.ok(found.some((o) => o.id === "o1"))
  assert.deepEqual(await store.listOffersNotified("nadie"), [])
})
