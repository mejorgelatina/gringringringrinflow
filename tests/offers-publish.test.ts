import assert from "node:assert/strict"
import { test } from "node:test"

import { localJudge } from "../lib/agent/judge.ts"
import { createScriptedPlanner } from "../lib/agent/planner.ts"
import type { AgentDeps } from "../lib/agent/tools.ts"
import { extractLocally } from "../lib/meta/meta.ts"
import { publishOffer, type PublishInput, type PublishWiring } from "../lib/offers/publish.ts"
import { createMemoryOffersStore, withOffersFallback, type OffersStore } from "../lib/offers/store.ts"
import type { Offer } from "../lib/offers/types.ts"

// E3: publish an offer. The whole pipeline runs offline (local extraction, scripted planner), so
// these prove the condition gate, the multi-photo evidence and ownership without Meta or Firebase.

const JPEG = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString("base64")
const BREAD = "Tenemos 20 cajas de pan fresco en la colonia Roma, hay que recogerlas antes de las 6 pm."
const SHELLS = "8 kg de cáscara de huevo limpia y seca, sin residuo, no apta para consumo, en la colonia Roma, recoger antes de las 3 pm."

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
    message: BREAD, photos: [], donorUid: "uid-a", donorRegId: "reg-a",
    donorName: "fonda roma", donorRegStatus: "verified", confirmEdible: true, ...over,
  }
}

test("OF-01: a confirmed edible offer opens the people tier and carries the agent proposal", async () => {
  const offer = await publishOffer(input(), wiring())
  assert.equal(offer.donorUid, "uid-a")
  assert.equal(offer.condition.effective, "edible")
  assert.ok(offer.eligible.some((e) => e.tier === "people"), "people tier should be eligible")
  assert.equal(offer.tier, "people")
  assert.ok(offer.proposal, "the agent should draft a proposal")
  assert.equal(offer.proposal?.tier, "people")
  assert.ok(offer.agentCode?.startsWith("GF-"))
  assert.deepEqual(offer.warnings.filter((w) => w.code === "proposal_gated"), [])
  assert.equal(offer.status, "open")
  assert.equal(offer.metaCalls, 0)
})

test("OF-02: without the edible attestation the people tier stays closed (condition gate)", async () => {
  const offer = await publishOffer(input({ confirmEdible: false }), wiring())
  assert.equal(offer.condition.effective, "edible")
  assert.ok(!offer.eligible.some((e) => e.tier === "people"), "people tier must be excluded")
  assert.ok(offer.warnings.some((w) => w.code === "people_gated"), "the gate must be explained")
  // The agent drafts without knowing about the checkbox; the warning keeps the two honest.
  assert.ok(offer.proposal, "the agent still drafts its proposal")
  assert.ok(offer.warnings.some((w) => w.code === "proposal_gated"), "a gated proposal must be flagged")
})

test("OF-03: attesting edible over a stated-inedible lot sends the offer to review", async () => {
  const offer = await publishOffer(input({ message: "5 kg de pan podrido en la colonia Roma, recoger antes de las 6 pm" }), wiring())
  assert.equal(offer.condition.effective, "unknown")
  assert.equal(offer.status, "needs_review")
  assert.ok(offer.reviewReasons.length > 0)
  assert.ok(!offer.eligible.some((e) => e.tier === "people"))
})

test("OF-04: an inedible organic lot routes to valorization, never to people", async () => {
  const offer = await publishOffer(input({ message: SHELLS, confirmEdible: false }), wiring())
  assert.ok(!offer.eligible.some((e) => e.tier === "people"))
  assert.ok(offer.eligible.length > 0, "valorization should take it")
  assert.ok(offer.tier === "transformation" || offer.tier === "compost")
})

test("OF-05: up to three photos are assessed locally and their bytes are never persisted", async () => {
  const offer = await publishOffer(input({ photos: [JPEG, JPEG, JPEG] }), wiring())
  assert.deepEqual(offer.photos.received, 3)
  assert.deepEqual(offer.photos.analyzed, 3)
  assert.equal(offer.photos.notes.length, 3)
  assert.ok(offer.photos.notes.every((n) => n.includes("modo local")))
  assert.equal(offer.metaCalls, 0)
  assert.ok(!JSON.stringify(offer).includes("data:image"), "no photo bytes may reach the stored offer")
})

test("OF-06: a message with no offer becomes a needs-review case, not a silent drop", async () => {
  const offer = await publishOffer(input({ message: "hola, ¿cómo están?", confirmEdible: false }), wiring())
  assert.equal(offer.status, "needs_review")
  assert.equal(offer.reviewNeeded, true)
  assert.ok(offer.reviewReasons.length > 0)
  assert.deepEqual(offer.eligible, [])
  assert.equal(offer.tier, null)
})

test("OF-07: the store scopes reads by owner uid, newest first", async () => {
  const store = createMemoryOffersStore()
  const base = await publishOffer(input(), wiring())
  const mine = (id: string, uid: string, at: string): Offer => ({ ...structuredClone(base), id, donorUid: uid, createdAt: at })
  await store.saveOffer(mine("o1", "uid-a", "2026-11-03T10:00:00.000Z"))
  await store.saveOffer(mine("o2", "uid-b", "2026-11-03T11:00:00.000Z"))
  await store.saveOffer(mine("o3", "uid-a", "2026-11-03T12:00:00.000Z"))
  assert.deepEqual((await store.listOffersByOwner("uid-a")).map((o) => o.id), ["o3", "o1"])
  assert.deepEqual((await store.listOffersByOwner("uid-b")).map((o) => o.id), ["o2"])
  assert.deepEqual((await store.listOffersByOwner("uid-c")).map((o) => o.id), [])
})

test("OF-08: the fallback store answers from memory when firestore fails, and says so", async () => {
  const backup = createMemoryOffersStore()
  const base = await publishOffer(input(), wiring())
  await backup.saveOffer({ ...base, id: "o1" })
  const failing: OffersStore = {
    kind: "firestore",
    saveOffer: async () => { throw new Error("boom") },
    getOffer: async () => { throw new Error("boom") },
    listOffersByOwner: async () => { throw new Error("boom") },
  }
  const store = withOffersFallback(failing, backup)
  assert.equal((await store.getOffer("o1"))?.id, "o1")
  assert.deepEqual((await store.listOffersByOwner("uid-a")).map((o) => o.id), ["o1"])
  assert.match(store.lastError ?? "", /firestore read failed/)
  await store.saveOffer({ ...base, id: "o2", donorUid: "uid-b" })
  assert.equal((await backup.getOffer("o2"))?.donorUid, "uid-b")
  assert.match(store.lastError ?? "", /firestore write failed/)
})
