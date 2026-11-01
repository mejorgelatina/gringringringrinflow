import assert from "node:assert/strict"
import { test } from "node:test"

import type { IntakeDeps } from "../lib/intake/process.ts"
import { extractLocally } from "../lib/meta/meta.ts"
import { handleInbound } from "../lib/whatsapp/handler.ts"
import { parseInbound } from "../lib/whatsapp/webhook.ts"
import { createMemoryStore, type RegistryStore } from "../lib/registry/store.ts"
import { hoursLabel, parseContact, parseHours, parseRoles, wantsToRegister } from "../lib/registry/parse.ts"
import { refreshLiveNetwork, toParticipant } from "../lib/registry/network.ts"
import { liveNetwork, setRegisteredParticipants } from "../lib/network/live.ts"
import { evaluateSupply } from "../lib/network/supply.ts"

const deps: IntakeDeps = {
  useMeta: false, modelId: null, visionModelId: null,
  extractWithMeta: async () => { throw new Error("must not be called") },
  extractLocally,
  assessPhotoWithMeta: async () => { throw new Error("must not be called") },
}

let n = 0
function chat(store: RegistryStore, from = "5215511112222", source: "webhook" | "simulator" = "webhook") {
  return async (text: string, location?: { lat: number; lng: number; label: string }) => {
    const t = await handleInbound(
      { id: `m${n++}`, from, timestamp: "1", type: location ? "location" : "text", text, mediaId: null, location: location ?? null },
      { deps, allowlist: undefined, send: null, fetchMedia: null, source, store },
    )
    return t
  }
}

test("hours: common ways people write their schedule", () => {
  assert.deepEqual(parseHours("lunes a viernes de 9 a 6"), { days: [1, 2, 3, 4, 5], from: 540, to: 1080 })
  assert.deepEqual({ ...parseHours("todos los días 8:00-14:30")!, days: [] }, { days: [], from: 480, to: 870 })
  assert.equal(parseHours("todos los días 8:00-14:30")!.days.length, 7)
  assert.deepEqual(parseHours("sábados de 10am a 2pm"), { days: [6], from: 600, to: 840 })
  assert.equal(parseHours("cuando sea"), null)
  assert.equal(hoursLabel(parseHours("lunes a viernes de 9 a 6")), "lunes a viernes de 09:00 a 18:00")
})

test("roles, contact and the registration trigger", () => {
  assert.deepEqual(parseRoles("2"), ["receiver"])
  assert.deepEqual(parseRoles("1 y 3"), ["donor", "maker"])
  assert.deepEqual(parseRoles("somos un comedor comunitario"), ["receiver"])
  assert.deepEqual(parseContact("Mariana López 55 1234 5678", "5215500000000"), { name: "Mariana López", phone: "5512345678" })
  assert.deepEqual(parseContact("soy Ana", "5215511112222"), { name: "Ana", phone: "5215511112222" })
  assert.ok(wantsToRegister("hola, quiero registrar mi organización"))
  assert.ok(wantsToRegister("cómo nos damos de alta?"))
  assert.ok(!wantsToRegister("tengo 20 cajas de pan en la roma"))
})

test("whatsapp location pins are parsed", () => {
  const [m] = parseInbound({ entry: [{ changes: [{ value: { messages: [{ id: "p", from: "521", type: "location", location: { latitude: 19.41, longitude: -99.16, name: "Comedor", address: "Orizaba 101" } }] } }] }] })
  assert.equal(m.type, "location")
  assert.deepEqual(m.location, { lat: 19.41, lng: -99.16, label: "Comedor, Orizaba 101" })
})

test("onboarding: a comedor registers in one whatsapp conversation, is verified, and starts receiving matches", async () => {
  setRegisteredParticipants([])
  const store = createMemoryStore()
  const say = chat(store)
  let t = await say("Hola, quiero registrar mi organización")
  assert.match(t.reply!, /¿Qué hace tu organización\?/)
  t = await say("2")
  assert.match(t.reply!, /¿Cómo se llama/)
  t = await say("Comedor Santa Fe de la Roma")
  assert.match(t.reply!, /ubicación/)
  t = await say("", { lat: 19.4185, lng: -99.1625, label: "Orizaba 101, Roma Norte" })
  assert.match(t.reply!, /horario pueden recibir/)
  t = await say("lunes a sábado de 12 a 7")
  assert.match(t.reply!, /persona de contacto/)
  t = await say("Mariana López 55 1234 5678")
  assert.match(t.reply!, /Qué alimentos pueden recibir/)
  t = await say("pan, fruta y verdura, unos 80 kg por semana")
  assert.match(t.reply!, /recogemos/)
  t = await say("mandamos uber")
  assert.match(t.reply!, /Esto es lo que registré/)
  assert.match(t.reply!, /Comedor Santa Fe de la Roma/)
  assert.match(t.reply!, /mandan su propio envío/)
  t = await say("sí")
  assert.match(t.reply!, /Quedó registrado/)
  assert.ok(t.onboarding?.registrationId)

  const [reg] = await store.listRegistrations()
  assert.equal(reg.status, "pending")
  assert.deepEqual(reg.roles, ["receiver"])
  assert.equal(reg.locationSource, "pin")
  assert.deepEqual(reg.hours, { days: [1, 2, 3, 4, 5, 6], from: 720, to: 1140 })
  assert.deepEqual(reg.contacts, [{ name: "Mariana López", phone: "5512345678" }])
  assert.deepEqual(reg.accepts?.categories.sort(), ["frutas", "panificados", "verduras"])
  assert.equal(reg.accepts?.weeklyKg, 80)
  assert.equal(reg.selfPickup, false)
  assert.equal(reg.whatsappOptIn, true)
  assert.equal(toParticipant(reg), null, "a pending registration never enters the network")
  assert.ok((await store.listInbox()).some(i => i.kind === "registration"))

  // A person verifies it: it joins the network and an offer nearby now lists it.
  await store.saveRegistration({ ...reg, status: "verified", verifiedBy: "ana", verifiedAt: new Date().toISOString() })
  await refreshLiveNetwork(store)
  assert.ok(liveNetwork().participants.some(p => p.id === reg.id))
  const rows = evaluateSupply({ item: "pan", category: "panificados", quantity: 10, unit: "kg", quantityBasis: "stated", condition: "edible", deadlineHour: 18, location: "roma norte" }, "10 kg de pan en buen estado")
  const mine = rows.filter(r => r.recipientId === reg.id)
  assert.ok(mine.some(r => r.feasible && r.capacityId === "own-courier"), JSON.stringify(mine))
  setRegisteredParticipants([])
})

test("onboarding can be cancelled, and nothing is saved", async () => {
  const store = createMemoryStore()
  const say = chat(store)
  await say("quiero registrarme")
  const t = await say("cancelar")
  assert.match(t.reply!, /cancelé/)
  assert.equal((await store.listRegistrations()).length, 0)
})

test("memory: an answer completes the offer instead of starting over", async () => {
  const store = createMemoryStore()
  const say = chat(store, "5215533334444")
  const first = await say("Tenemos 20 cajas de pan fresco")
  assert.match(first.reply!, /\?/)
  const second = await say("en la colonia Roma, hay que recogerlas antes de las 6 pm")
  assert.ok(second.steps.some(s => s.step === "memory" && /continuing/.test(s.detail)))
  assert.equal(second.intake?.supply?.quantity, 20)
  assert.equal(second.intake?.supply?.location?.toLowerCase(), "roma")
  assert.equal(second.intake?.supply?.deadlineHour, 18)
  assert.equal((await store.listInbox()).filter(i => i.kind === "offer").length, 1, "the answer updates the offer's row, it doesn't add one")
})

test("a location pin becomes the pickup point of the offer in progress", async () => {
  const store = createMemoryStore()
  const say = chat(store, "5215555556666")
  await say("Tenemos 20 cajas de pan fresco, recoger antes de las 6 pm")
  const t = await say("", { lat: 19.4167, lng: -99.1453, label: "Dr. Vértiz 200, Doctores" })
  assert.ok(t.steps.some(s => s.step === "origin" && /pin/.test(s.detail)))
  assert.deepEqual(t.intake?.supply?.point, { lat: 19.4167, lng: -99.1453 })
  assert.ok(!t.intake?.supply?.location || /Doctores/.test(t.intake.supply.location))
})

test("a registered donor doesn't repeat the address: the offer uses where it registered", async () => {
  const store = createMemoryStore()
  const at = new Date().toISOString()
  await store.saveRegistration({ id: "reg-test", phone: "5215577778888", source: "webhook", name: "Panadería Orizaba", roles: ["donor"], address: "Orizaba 50, Roma Norte", location: { lat: 19.4194, lng: -99.1617 }, locationSource: "pin", area: "roma norte", hours: null, hoursText: "", contacts: [], accepts: null, generates: null, selfPickup: null, whatsappOptIn: true, status: "verified", createdAt: at, updatedAt: at, verifiedAt: at, verifiedBy: "ana", notes: null })
  const t = await chat(store, "5215577778888")("Tenemos 20 cajas de pan fresco, recoger antes de las 6 pm")
  assert.ok(t.steps.some(s => s.step === "sender" && /Panadería Orizaba/.test(s.detail)))
  assert.deepEqual(t.intake?.supply?.point, { lat: 19.4194, lng: -99.1617 })
  assert.equal(t.intake?.supply?.donorId, "reg-test")
  assert.ok(!/registrar/.test(t.reply!), "no registration tip for someone already registered")
  setRegisteredParticipants([])
})

test("an unregistered organization saying it can receive is invited to register", async () => {
  const t = await chat(createMemoryStore(), "5215599990000")("Somos un comedor en la colonia Roma, podemos recibir 30 kilos de verdura hasta las 5 pm")
  assert.match(t.reply!, /escribe "registrar"/)
})
