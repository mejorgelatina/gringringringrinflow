import assert from "node:assert/strict"
import { test } from "node:test"

import { localJudge } from "../lib/agent/judge.ts"
import { createScriptedPlanner } from "../lib/agent/planner.ts"
import type { AgentDeps } from "../lib/agent/tools.ts"
import { extractLocally } from "../lib/meta/meta.ts"
import { inboxFor } from "../lib/offers/inbox.ts"
import { createMemoryMissionStore, ensureMission } from "../lib/offers/missions.ts"
import { publishOffer, type PublishInput, type PublishWiring } from "../lib/offers/publish.ts"
import { chooseDeliveryMode, reserveHold } from "../lib/offers/respond.ts"
import { donorPins, missionPins, pinsCenter } from "../lib/map/points.ts"
import { liveNetwork } from "../lib/network/live.ts"

// E6: map view-models. Exact pins only where the viewer is entitled: the donor's own lots and
// the holder's committed pickups. Eligible destinations stay zone labels without coordinates.

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

test("MAP-01: the donor pins its own lots; eligible entries carry zones, never coordinates", async () => {
  const offer = await publishOffer(input(), wiring())
  assert.ok(offer.case?.resource.location, "the lot needs a point")
  const { pins, zones } = donorPins([offer])
  assert.equal(pins.length, 1)
  assert.deepEqual(pins[0].point, offer.case!.resource.location)
  assert.equal(pins[0].kind, "mine")
  const list = zones[offer.id]
  assert.ok(list.length > 0, "the lot needs eligible destinations")
  for (const z of list) {
    assert.ok(["a", "b", "c"].includes(z.zone))
    assert.ok(z.name && z.maxKg > 0)
    assert.ok(!("point" in z) && !("location" in z), "no foreign coordinates travel")
  }
  assert.ok(!JSON.stringify(list).includes(JSON.stringify(offer.case!.resource.location).slice(0, 10)))
})

test("MAP-02: the holder pins committed pickups only", async () => {
  const store = createMemoryMissionStore()
  const published = await publishOffer(input(), wiring())
  const pid = published.notifiedIds[0]
  const held = reserveHold(published, pid, 5, TUESDAY, network())
  const rid = held.case!.reservations[0].id
  const scheduled = chooseDeliveryMode(held, pid, rid, "pickup", null, TUESDAY, network())
  const mission = (await ensureMission(store, scheduled, scheduled.case!.reservations[0], "uid-b"))!
  const [item] = inboxFor([scheduled], pid, network(), TUESDAY)
  const pins = missionPins([{ mission, item }])
  assert.equal(pins.length, 1)
  assert.deepEqual(pins[0].point, scheduled.case!.resource.location)
  assert.equal(pins[0].kind, "pickup")
  // Expired missions leave the map.
  assert.deepEqual(missionPins([{ mission: { ...mission, status: "expired" }, item }]), [])
  // And an uncommitted view (no revealed point) pins nothing.
  const [browsing] = inboxFor([published], published.notifiedIds[0], network(), TUESDAY)
  assert.equal(browsing.offer.case?.resource.location, null)
})

test("MAP-03: the center averages pins, defaulting to the pilot area", () => {
  assert.deepEqual(pinsCenter([]), { lat: 19.4194, lng: -99.1617 })
  assert.deepEqual(
    pinsCenter([
      { id: "a", point: { lat: 19.4, lng: -99.16 }, title: "a", detail: "", kind: "mine" },
      { id: "b", point: { lat: 19.42, lng: -99.18 }, title: "b", detail: "", kind: "pickup" },
    ]),
    { lat: 19.41, lng: -99.17 },
  )
})
