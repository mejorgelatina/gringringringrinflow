import assert from "node:assert/strict"
import { test } from "node:test"

import { createFirestoreStore, createMemoryStore, type RegistryStore } from "../lib/registry/store.ts"
import type { Conversation, InboxItem, Registration } from "../lib/registry/types.ts"

// Contract tests for the RegistryStore interface: the same battery runs against the memory store and
// against the real Firestore adapter with an in-memory fake db. The fake only mimics the Firestore
// calls the adapter makes (doc get/set, == where, orderBy + limit); it proves the adapter's mapping
// (collections, doc ids, filters, sort), not the Firestore service itself.

type DocData = Record<string, unknown>

class FakeCollection {
  readonly docs = new Map<string, unknown>()
  doc(id: string) {
    return {
      get: async () => {
        const v = this.docs.get(id)
        return { exists: v !== undefined, data: () => (v === undefined ? undefined : structuredClone(v)) }
      },
      set: async (v: unknown) => { this.docs.set(id, structuredClone(v)) },
    }
  }
  where(field: string, op: string, value: unknown) {
    assert.equal(op, "==")
    const hits = [...this.docs.values()].filter((d) => (d as DocData)[field] === value)
    return { get: async () => ({ docs: hits.map((d) => ({ data: () => structuredClone(d) })) }) }
  }
  orderBy(field: string, dir: "asc" | "desc") {
    const sorted = () => [...this.docs.values()].sort((a, b) => {
      const av = String((a as DocData)[field] ?? ""), bv = String((b as DocData)[field] ?? "")
      return dir === "desc" ? bv.localeCompare(av) : av.localeCompare(bv)
    })
    const docs = (list: unknown[]) => ({ docs: list.map((d) => ({ data: () => structuredClone(d) })) })
    return { get: async () => docs(sorted()), limit: (n: number) => ({ get: async () => docs(sorted().slice(0, n)) }) }
  }
}

class FakeDb {
  readonly collections = new Map<string, FakeCollection>()
  collection(name: string) {
    let c = this.collections.get(name)
    if (!c) { c = new FakeCollection(); this.collections.set(name, c) }
    return c
  }
}

function firestoreAdapterOverFake(): { store: RegistryStore; db: FakeDb } {
  const db = new FakeDb()
  const store = createFirestoreStore(db as never)
  assert.ok(store, "adapter builds over the fake db")
  return { store, db }
}

const AT = "2026-11-02T12:00:00.000Z"

function makeRegistration(overrides: Partial<Registration> = {}): Registration {
  return {
    id: "reg-1", phone: "5215511112222", ownerUid: null, source: "webhook", name: "Org",
    roles: ["receiver"], address: null, location: null, locationSource: null, area: null,
    hours: null, hoursText: "", contacts: [], accepts: null, generates: null,
    selfPickup: null, whatsappOptIn: true, status: "pending",
    createdAt: AT, updatedAt: AT, verifiedAt: null, verifiedBy: null, notes: null,
    ...overrides,
  }
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return { key: "webhook:5215511112222", phone: "5215511112222", source: "webhook", history: [], openQuestion: false, onboarding: null, pin: null, updatedAt: AT, ...overrides }
}

function makeInbox(overrides: Partial<InboxItem> = {}): InboxItem {
  return { id: "in-1", at: AT, phone: "5215511112222", source: "webhook", kind: "offer", summary: "s", text: "t", registrationId: null, feasible: 0, ...overrides }
}

function battery(label: string, make: () => RegistryStore) {
  test(`${label}: conversations round-trip, and missing keys read null`, async () => {
    const store = make()
    assert.equal(await store.getConversation("nope"), null)
    await store.saveConversation(makeConversation({ key: "k1", history: [{ text: "hola", at: AT }] }))
    assert.deepEqual(await store.getConversation("k1"), makeConversation({ key: "k1", history: [{ text: "hola", at: AT }] }))
  })

  test(`${label}: saved copies are isolated from later mutations`, async () => {
    const store = make()
    const conv = makeConversation({ key: "k2" })
    await store.saveConversation(conv)
    conv.history.push({ text: "mutated", at: AT })
    assert.deepEqual((await store.getConversation("k2"))?.history, [])
    const fetched = await store.getConversation("k2")
    fetched!.history.push({ text: "mutated", at: AT })
    assert.deepEqual((await store.getConversation("k2"))?.history, [])
  })

  test(`${label}: registrations round-trip, and missing ids read null`, async () => {
    const store = make()
    assert.equal(await store.getRegistration("nope"), null)
    await store.saveRegistration(makeRegistration({ id: "r1", name: "Comedor" }))
    assert.equal((await store.getRegistration("r1"))?.name, "Comedor")
  })

  test(`${label}: findRegistrationByPhone normalizes, skips rejected, prefers newest`, async () => {
    const store = make()
    await store.saveRegistration(makeRegistration({ id: "old", status: "verified", updatedAt: "2026-11-01T12:00:00.000Z" }))
    await store.saveRegistration(makeRegistration({ id: "new", status: "verified", updatedAt: "2026-11-03T12:00:00.000Z" }))
    await store.saveRegistration(makeRegistration({ id: "rej", status: "rejected", updatedAt: "2026-11-04T12:00:00.000Z" }))
    assert.equal((await store.findRegistrationByPhone("+52 1 55 1111-2222"))?.id, "new")
    assert.equal(await store.findRegistrationByPhone("000"), null)
  })

  test(`${label}: findRegistrationByOwner returns the newest owned registration`, async () => {
    const store = make()
    await store.saveRegistration(makeRegistration({ id: "o1", ownerUid: "uid-a", updatedAt: "2026-11-01T12:00:00.000Z" }))
    await store.saveRegistration(makeRegistration({ id: "o2", ownerUid: "uid-a", updatedAt: "2026-11-03T12:00:00.000Z" }))
    await store.saveRegistration(makeRegistration({ id: "o3", ownerUid: "uid-b" }))
    await store.saveRegistration(makeRegistration({ id: "o4", ownerUid: null }))
    assert.equal((await store.findRegistrationByOwner("uid-a"))?.id, "o2")
    assert.equal((await store.findRegistrationByOwner("uid-b"))?.id, "o3")
    assert.equal(await store.findRegistrationByOwner("uid-none"), null)
  })

  test(`${label}: listRegistrations is newest-first by createdAt`, async () => {
    const store = make()
    await store.saveRegistration(makeRegistration({ id: "a", createdAt: "2026-11-01T00:00:00.000Z" }))
    await store.saveRegistration(makeRegistration({ id: "b", createdAt: "2026-11-03T00:00:00.000Z" }))
    assert.deepEqual((await store.listRegistrations()).map((r) => r.id), ["b", "a"])
  })

  test(`${label}: inbox is newest-first, updates by id, honors the limit`, async () => {
    const store = make()
    await store.addInbox(makeInbox({ id: "x", at: "2026-11-01T00:00:00.000Z" }))
    await store.addInbox(makeInbox({ id: "y", at: "2026-11-02T00:00:00.000Z" }))
    await store.addInbox(makeInbox({ id: "x", at: "2026-11-03T00:00:00.000Z" }))
    assert.deepEqual((await store.listInbox()).map((i) => i.id), ["x", "y"])
    assert.deepEqual((await store.listInbox(1)).map((i) => i.id), ["x"])
  })
}

battery("memory", createMemoryStore)
battery("firestore-adapter", () => firestoreAdapterOverFake().store)

test("firestore-adapter: uses the documented collections and doc ids", async () => {
  const { store, db } = firestoreAdapterOverFake()
  await store.saveConversation(makeConversation({ key: "k-doc" }))
  await store.saveRegistration(makeRegistration({ id: "reg-doc" }))
  await store.addInbox(makeInbox({ id: "in-doc" }))
  assert.ok(db.collections.has("gf_conversations"))
  assert.ok(db.collections.get("gf_registrations")?.docs.has("reg-doc"), "registrations are stored by id")
  assert.ok(db.collections.get("gf_inbox")?.docs.has("in-doc"), "inbox rows are stored by id")
  const convIds = [...(db.collections.get("gf_conversations")?.docs.keys() ?? [])]
  assert.equal(convIds.length, 1)
  assert.match(convIds[0], /^[0-9a-f]{40}$/, "conversation keys are hashed, never raw phone numbers")
})

test("createFirestoreStore without a db returns null (memory mode)", () => {
  assert.equal(createFirestoreStore(null), null)
})
