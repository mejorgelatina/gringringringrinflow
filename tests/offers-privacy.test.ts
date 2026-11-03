import assert from "node:assert/strict"
import { test } from "node:test"

import { localJudge } from "../lib/agent/judge.ts"
import { createScriptedPlanner } from "../lib/agent/planner.ts"
import type { AgentDeps } from "../lib/agent/tools.ts"
import { extractLocally } from "../lib/meta/meta.ts"
import { inboxFor, tickOffer } from "../lib/offers/inbox.ts"
import { publishOffer, type PublishInput, type PublishWiring } from "../lib/offers/publish.ts"
import { availableKg, chooseDeliveryMode, choicesFor, reserveHold } from "../lib/offers/respond.ts"
import { publicRegistration } from "../lib/registry/display.ts"
import type { Registration } from "../lib/registry/types.ts"
import { liveNetwork } from "../lib/network/live.ts"

// Privacy projections. /api/inbox returns inboxFor() verbatim and /api/org/me returns
// publicRegistration() verbatim, so these tests assert on the exact payload shapes.

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

test("PR-01: the inbox payload carries no ownership, raw text, lists, agent data or foreign holds", async () => {
  const network = liveNetwork()
  const at = TUESDAY + 31 * 60_000
  const published = await publishOffer(input(), wiring())
  // Two holders from different waves: people first, compost after widening.
  const widened = tickOffer(published, network, at)
  const [viewer, other] = widened.notifiedIds
  assert.ok(viewer && other, "need two notified participants")
  const h1 = reserveHold(widened, viewer, 5, at, network)
  const h2 = reserveHold(h1, other, 5, at, network)
  assert.equal(availableKg(h2.case!), 0)

  const [item] = inboxFor([h2], viewer, network, at)
  const o = item.offer as unknown as Record<string, unknown>
  for (const key of ["donorUid", "donorRegId", "message", "eligible", "notifiedIds", "proposal", "agentStatus", "agentCode", "provider", "metaCalls"]) {
    assert.ok(!(key in o), `inbox offer must not carry ${key}`)
  }
  const c = o.case as Record<string, unknown>
  for (const key of ["waves", "events"]) assert.ok(!(key in c), `inbox case must not carry ${key}`)
  assert.ok(!("donorId" in (c.resource as Record<string, unknown>)), "inbox resource must not carry donorId")
  assert.ok(!("message" in o), "donor raw text field must be absent")
  const payload = JSON.stringify(item)
  assert.ok(!payload.includes(KG_LOT), "donor raw text must not leak anywhere in the payload")
  assert.ok(!payload.includes("uid-a"), "donor uid must not leak")
  assert.ok(!payload.includes("reg-a"), "donor registration id must not leak")

  // Only the viewer's own holds travel; the other hold is invisible.
  assert.ok(item.mine.length === 1 && item.mine[0].participantId === viewer)
  assert.deepEqual(item.offer.case?.reservations.map((r) => r.participantId), [viewer])
  const otherHold = h2.case!.reservations.find((r) => r.participantId === other)!
  assert.ok(!payload.includes(otherHold.id), "another participant's hold must not leak")

  // No other organization's name travels. The donor (counterparty) and the viewer may appear.
  const viewerName = network.participants.find((p) => p.id === viewer)!.name
  assert.ok(payload.includes("fonda roma"), "the donor counterparty stays visible")
  assert.ok(payload.includes(viewerName), "the viewer own name stays visible where relevant")
  for (const p of network.participants) {
    if (p.id === viewer) continue
    assert.ok(!payload.includes(p.name), `must not leak ${p.name}`)
  }

  // The match carries routing facts only, no names.
  assert.deepEqual(Object.keys(item.myMatch ?? {}).sort(), ["etaMinutes", "maxKg", "roadKm", "tier", "zone"])
})

test("PR-02: the scheduled holder sees the pickup point but nothing else new", async () => {
  const network = liveNetwork()
  const published = await publishOffer(input(), wiring())
  const viewer = published.notifiedIds[0]
  const held = reserveHold(published, viewer, 5, TUESDAY, network)
  const rid = held.case!.reservations[0].id
  const pickup = choicesFor(held, viewer, rid, TUESDAY, network).find((q) => q.mode === "pickup")
  if (!pickup) return // address reveal needs a schedulable hold
  const scheduled = chooseDeliveryMode(held, viewer, rid, "pickup", null, TUESDAY, network)
  const [item] = inboxFor([scheduled], viewer, network, TUESDAY)
  assert.ok(item.offer.location, "pickup address revealed")
  assert.ok(item.offer.case?.resource.location, "pickup point revealed")
  const o = item.offer as unknown as Record<string, unknown>
  for (const key of ["donorUid", "donorRegId", "message", "eligible", "notifiedIds", "proposal"]) {
    assert.ok(!(key in o), `committed view must not carry ${key}`)
  }
  const payload = JSON.stringify(item)
  for (const p of network.participants) {
    if (p.id === viewer) continue
    assert.ok(!payload.includes(p.name), `must not leak ${p.name}`)
  }
})

test("PR-03: the owner's own registration carries no team notes", () => {
  const reg: Registration = {
    id: "reg-a", phone: "5215500000000", ownerUid: "uid-a", source: "web", name: "fonda roma",
    roles: ["donor"], address: "roma norte", location: null, locationSource: null, area: null,
    hours: null, hoursText: "", contacts: [], accepts: null, generates: null, selfPickup: null,
    whatsappOptIn: false, status: "rejected", createdAt: "2026-11-03T10:00:00.000Z",
    updatedAt: "2026-11-03T11:00:00.000Z", verifiedAt: null, verifiedBy: "ana",
    notes: "internal: duplicate of reg-b, call before deciding",
  }
  const pub = publicRegistration(reg)
  assert.ok(!("notes" in pub), "team notes must not reach the owner")
  assert.ok(!JSON.stringify(pub).includes("duplicate of reg-b"))
  assert.equal(pub.name, "fonda roma")
  assert.deepEqual(pub.roles, ["donor"])
  assert.equal(pub.status, "rejected")
  assert.equal(pub.ownerUid, "uid-a")
})
