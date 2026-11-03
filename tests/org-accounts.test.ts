import assert from "node:assert/strict"
import { test } from "node:test"

import { authorizeOrg, ownsOrgResource } from "../lib/auth/org.ts"
import { STATUS_LABEL } from "../lib/registry/display.ts"
import { InvalidProfileError, buildWebRegistration } from "../lib/registry/profile.ts"
import { createMemoryStore, withFallback, type RegistryStore } from "../lib/registry/store.ts"
import type { Registration } from "../lib/registry/types.ts"

// E1: organization accounts and data isolation. The verifier is injected, so these prove the
// 401/403 matrix and ownership without Firebase; real accounts are tested in preview.

const IDS = { id: "reg-web-1", ownerUid: "uid-a", now: "2026-11-03T12:00:00.000Z" }

function authed(token: string | null) {
  return new Request("http://x/api/org/me", token ? { headers: { authorization: `Bearer ${token}` } } : {})
}

test("org-auth: no token is 401", async () => {
  assert.deepEqual(await authorizeOrg(authed(null), async () => { throw new Error("must not verify") }), { ok: false, status: 401, reason: "no-token" })
})

test("org-auth: unconfigured firebase is 401 without calling out", async () => {
  assert.deepEqual(await authorizeOrg(authed("t"), async () => null), { ok: false, status: 401, reason: "auth-not-configured" })
})

test("org-auth: an invalid token is 401", async () => {
  assert.deepEqual(await authorizeOrg(authed("bogus"), async () => { throw new Error("bad signature") }), { ok: false, status: 401, reason: "invalid-token" })
})

test("org-auth: a verified token yields the uid", async () => {
  assert.deepEqual(
    await authorizeOrg(authed("good"), async () => ({ uid: "uid-a", email: "a@org.mx", email_verified: true })),
    { ok: true, identity: { uid: "uid-a", email: "a@org.mx" } },
  )
  const noEmail = await authorizeOrg(authed("good"), async () => ({ uid: "uid-a" }))
  assert.deepEqual(noEmail, { ok: true, identity: { uid: "uid-a", email: null } })
})

test("org-auth: only the owner uid opens its resource", () => {
  assert.equal(ownsOrgResource({ uid: "uid-a", email: null }, "uid-a"), true)
  assert.equal(ownsOrgResource({ uid: "uid-a", email: null }, "uid-b"), false)
  assert.equal(ownsOrgResource({ uid: "uid-a", email: null }, null), false)
  assert.equal(ownsOrgResource({ uid: "uid-a", email: null }, undefined), false)
  assert.equal(ownsOrgResource({ uid: "uid-a", email: null }, ""), false)
})

test("org-profile: a maker profile becomes a pending owned registration", () => {
  const r = buildWebRegistration({
    name: "Taller Biomaterial",
    roles: ["maker"],
    address: "Orizaba 101, Roma Norte",
    hoursText: "lunes a viernes de 10 a 5",
    contactName: "Beto",
    contactPhone: "+52 55 1234 5678",
    acceptsText: "cáscara de huevo limpia y seca, 30 kg",
  }, IDS)
  assert.equal(r.status, "pending")
  assert.equal(r.ownerUid, "uid-a")
  assert.equal(r.source, "web")
  assert.equal(r.whatsappOptIn, false)
  assert.equal(r.locationSource, "colonia")
  assert.deepEqual(r.location, { lat: 19.4194, lng: -99.1617 })
  assert.deepEqual(r.accepts?.materials, ["cáscara de huevo"])
  assert.deepEqual(r.accepts?.requires, ["limpia", "seca"])
  assert.equal(r.accepts?.weeklyKg, 30)
  assert.deepEqual(r.hours, { days: [1, 2, 3, 4, 5], from: 600, to: 1020 })
  assert.deepEqual(r.contacts, [{ name: "Beto", phone: "525512345678" }])
  assert.equal(r.phone, "525512345678")
  assert.equal(r.generates, null)
})

test("org-profile: donors parse what they generate, receivers parse what they take", () => {
  const donor = buildWebRegistration({ name: "Panadería", roles: ["donor"], generatesText: "pan del día, 20 kg, diario" }, IDS)
  assert.equal(donor.generates?.frequency, "diaria")
  assert.equal(donor.generates?.kgPerWeek, 20)
  assert.equal(donor.accepts, null)
  const receiver = buildWebRegistration({ name: "Comedor", roles: ["receiver"], acceptsText: "pan y fruta", generatesText: "pan" }, IDS)
  assert.deepEqual(receiver.accepts?.categories, ["panificados", "frutas"])
  assert.equal(receiver.generates, null, "generates is only kept for donors")
})

test("org-profile: rejects empty names, missing roles and unknown roles", () => {
  assert.throws(() => buildWebRegistration({ name: "  ", roles: ["donor"] }, IDS), InvalidProfileError)
  assert.throws(() => buildWebRegistration({ name: "x", roles: [] }, IDS), InvalidProfileError)
  assert.throws(() => buildWebRegistration({ name: "x", roles: ["carrier"] as never }, IDS), InvalidProfileError)
})

test("org-profile: unknown addresses stay unplaced and roles dedupe", () => {
  const r = buildWebRegistration({ name: "x", roles: ["donor", "donor"], address: "Calle Falsa 123" }, IDS)
  assert.deepEqual(r.roles, ["donor"])
  assert.equal(r.location, null)
  assert.equal(r.address, "Calle Falsa 123")
})

test("org-isolation: each uid reads only its own registration", async () => {
  const store = createMemoryStore()
  const at = "2026-11-03T12:00:00.000Z"
  const reg = (id: string, ownerUid: string | null): Registration => ({
    id, phone: "", ownerUid, source: "web", name: id, roles: ["receiver"], address: null,
    location: null, locationSource: null, area: null, hours: null, hoursText: "", contacts: [],
    accepts: null, generates: null, selfPickup: null, whatsappOptIn: false, status: "pending",
    createdAt: at, updatedAt: at, verifiedAt: null, verifiedBy: null, notes: null,
  })
  await store.saveRegistration(reg("a", "uid-a"))
  await store.saveRegistration(reg("b", "uid-b"))
  await store.saveRegistration(reg("legacy", null))
  assert.equal((await store.findRegistrationByOwner("uid-a"))?.id, "a")
  assert.equal((await store.findRegistrationByOwner("uid-b"))?.id, "b")
  const b = (await store.findRegistrationByOwner("uid-b"))!
  assert.equal(ownsOrgResource({ uid: "uid-a", email: null }, b.ownerUid), false, "uid-a must not open uid-b's registration")
  assert.equal(ownsOrgResource({ uid: "uid-a", email: null }, (await store.getRegistration("legacy"))!.ownerUid), false, "unclaimed registrations stay team-only")
})

test("org-isolation: owner lookup survives a failing primary", async () => {
  const fail = async (): Promise<never> => { throw new Error("boom") }
  const primary: RegistryStore = {
    kind: "firestore", getConversation: fail, saveConversation: fail, getRegistration: fail,
    findRegistrationByPhone: fail, findRegistrationByOwner: fail, saveRegistration: fail,
    listRegistrations: fail, addInbox: fail, listInbox: fail,
  }
  const backup = createMemoryStore()
  await backup.saveRegistration({ id: "a", phone: "", ownerUid: "uid-a", source: "web", name: "a", roles: ["receiver"], address: null, location: null, locationSource: null, area: null, hours: null, hoursText: "", contacts: [], accepts: null, generates: null, selfPickup: null, whatsappOptIn: false, status: "pending", createdAt: "2026-11-03T12:00:00.000Z", updatedAt: "2026-11-03T12:00:00.000Z", verifiedAt: null, verifiedBy: null, notes: null })
  const store = withFallback(primary, backup)
  assert.equal((await store.findRegistrationByOwner("uid-a"))?.id, "a")
  assert.match(store.lastError ?? "", /firestore read failed/)
})

test("org-display: status labels for the account view", () => {
  assert.deepEqual(STATUS_LABEL, { pending: "pendiente de verificación", verified: "verificada", rejected: "rechazada" })
})
