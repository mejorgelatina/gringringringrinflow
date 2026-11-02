import assert from "node:assert/strict"
import { test } from "node:test"

import { liveNetwork, registeredParticipants, setRegisteredParticipants } from "../lib/network/live.ts"
import { refreshLiveNetwork, toParticipant } from "../lib/registry/network.ts"
import { continueOnboarding, startOnboarding, summary } from "../lib/registry/onboarding.ts"
import {
  hoursLabel, isCancel, isNo, isYes, norm, parseAccepts, parseAddress, parseCategories,
  parseContact, parseGenerates, parseHours, parseKg, parsePickup, parseRoles, wantsToRegister,
} from "../lib/registry/parse.ts"
import { createMemoryStore, digits, withFallback, type RegistryStore } from "../lib/registry/store.ts"
import type { OnboardingState, Registration } from "../lib/registry/types.ts"

// Regression coverage for lib/registry that the whatsapp-level tests in registry.test.ts don't pin down:
// parser edge cases, memory-store semantics, the onboarding state machine driven directly, and the
// registration -> participant conversion. No network, no model calls.

// ---------- parse.ts: yes/no/cancel ----------

test("regression: norm strips accents, case and extra spaces", () => {
  assert.equal(norm("  SÍ,  está   BIEN  "), "si, esta bien")
})

test("regression: yes/no answers, without false positives on longer words", () => {
  assert.equal(isYes("Sí, está bien"), true)
  assert.equal(isYes("claro que sí"), true)
  assert.equal(isYes("ok"), true)
  assert.equal(isYes("sin cita previa"), false)
  assert.equal(isYes("tal vez"), false)
  assert.equal(isYes(""), false)
  assert.equal(isNo("no, gracias"), true)
  assert.equal(isNo("nel pastel"), true)
  assert.equal(isNo("noche de paz"), false)
})

test("regression: cancel words stop the flow, anything else continues", () => {
  assert.equal(isCancel("cancelar por favor"), true)
  assert.equal(isCancel("ya no quiero"), true)
  assert.equal(isCancel("cancela todo"), true)
  assert.equal(isCancel("continuar"), false)
  assert.equal(isCancel("la casa"), false)
})

// ---------- parse.ts: registration trigger and roles ----------

test("regression: registration triggers, and donor verbs alone don't trigger", () => {
  assert.equal(wantsToRegister("quiero darme de alta"), true)
  assert.equal(wantsToRegister("cómo me registro?"), true)
  assert.equal(wantsToRegister("actualizar mis datos"), true)
  assert.equal(wantsToRegister("sign up"), true)
  assert.equal(wantsToRegister("tengo 20 cajas de pan en la roma"), false)
  assert.equal(wantsToRegister("damos pan los lunes"), false)
  assert.equal(wantsToRegister("cuándo recogen?"), false)
})

test("regression: role parsing accepts numbers, words and combinations", () => {
  assert.deepEqual(parseRoles("1, 2 y 4"), ["donor", "receiver", "compost"])
  assert.deepEqual(parseRoles("donamos pan y hacemos composta"), ["donor", "compost"])
  assert.deepEqual(parseRoles("somos taller de biomateriales"), ["maker"])
  assert.deepEqual(parseRoles("hola, buenas tardes"), [])
})

// ---------- parse.ts: hours ----------

test("regression: hours parsing covers 24h, wrapped ranges and defaults", () => {
  assert.deepEqual(parseHours("abierto 24h"), { days: [1, 2, 3, 4, 5, 6, 0], from: 0, to: 1440 })
  assert.deepEqual(parseHours("lunes, miércoles y viernes de 10 a 14"), { days: [1, 3, 5], from: 600, to: 840 })
  assert.deepEqual(parseHours("de 9 a 6"), { days: [1, 2, 3, 4, 5, 6], from: 540, to: 1080 })
  assert.deepEqual(parseHours("sábado a lunes de 8 a 12"), { days: [6, 0, 1], from: 480, to: 720 })
  assert.deepEqual(parseHours("entre semana de 9:00 a 18:00"), { days: [1, 2, 3, 4, 5], from: 540, to: 1080 })
})

test("regression: hours reject an end before the start when both are explicit", () => {
  assert.equal(parseHours("de 6pm a 9am"), null)
  assert.equal(parseHours("cuando caiga"), null)
})

test("regression: hours labels fall back to the raw text or a default", () => {
  assert.equal(hoursLabel(null), "sin horario")
  assert.equal(hoursLabel(null, "cuando se pueda"), "cuando se pueda")
  assert.equal(hoursLabel({ days: [6, 0], from: 600, to: 840 }), "sáb, dom de 10:00 a 14:00")
  assert.equal(hoursLabel({ days: [1, 2, 3, 4, 5, 6], from: 540, to: 1080 }), "lunes a sábado de 09:00 a 18:00")
})

// ---------- parse.ts: contact, categories, kilos ----------

test("regression: contact parsing keeps the name, defaults the phone and truncates", () => {
  assert.deepEqual(parseContact("Mariana (coordinadora) 5512345678", "5215500000000"), { name: "Mariana (coordinadora)", phone: "5512345678" })
  assert.deepEqual(parseContact("yo, Ana, mi numero es este mismo", "5215511112222"), { name: "Ana", phone: "5215511112222" })
  assert.equal(parseContact("5512345678", "5215500000000"), null)
  assert.equal(parseContact("x".repeat(100), "5215500000000")?.name.length, 80)
})

test("regression: categories and kilos", () => {
  assert.deepEqual(parseCategories("recibimos de todo"), ["panificados", "verduras", "frutas", "lacteos", "abarrotes", "proteina"])
  assert.deepEqual(parseCategories("pan y tortillas, leche y queso"), ["panificados", "lacteos"])
  assert.deepEqual(parseCategories("ropa y juguetes"), [])
  assert.equal(parseKg("una tonelada al mes"), 1000)
  assert.equal(parseKg("unos 50 kilos"), 50)
  assert.equal(parseKg("2,5 kg"), 2.5)
  assert.equal(parseKg("mucho pan"), null)
})

test("regression: accepts capture maker materials plus specs, compost always takes organico", () => {
  const maker = parseAccepts("cáscara de huevo limpia y seca, 30 kg", ["maker"])
  assert.deepEqual(maker.materials, ["cáscara de huevo"])
  assert.deepEqual(maker.requires, ["limpia", "seca"])
  assert.deepEqual(maker.categories, ["organico"])
  assert.equal(maker.weeklyKg, 30)
  const compost = parseAccepts("restos de verdura", ["compost"])
  assert.deepEqual(compost.categories, ["organico", "verduras"])
  const receiver = parseAccepts("pan y fruta", ["receiver"])
  assert.deepEqual(receiver.categories, ["panificados", "frutas"])
  assert.deepEqual(receiver.materials, [])
})

test("regression: generates capture frequency, kilos and categories", () => {
  assert.deepEqual(parseGenerates("pan del día, unos 20 kg, diario"), { categories: ["panificados"], kgPerWeek: 20, frequency: "diaria", text: "pan del día, unos 20 kg, diario" })
  assert.equal(parseGenerates("verdura cada martes").frequency, "semanal")
  assert.equal(parseGenerates("a veces sobra arroz").frequency, "eventual")
  assert.equal(parseGenerates("sobra pan").frequency, null)
})

test("regression: pickup answers distinguish self-pickup from own courier", () => {
  assert.equal(parsePickup("recogemos con nuestra camioneta"), true)
  assert.equal(parsePickup("sí"), true)
  assert.equal(parsePickup("mejor mandamos uber"), false)
  assert.equal(parsePickup("no podemos pasar"), false)
  assert.equal(parsePickup("tal vez"), null)
})

test("regression: addresses keep the raw text and only place known colonias", () => {
  const known = parseAddress("Orizaba 101, Roma Norte")
  assert.equal(known.address, "Orizaba 101, Roma Norte")
  assert.equal(known.area, "roma norte")
  assert.deepEqual(known.point, { lat: 19.4194, lng: -99.1617 })
  const unknown = parseAddress("Calle Falsa 123, Colonia Desconocida")
  assert.equal(unknown.address, "Calle Falsa 123, Colonia Desconocida")
  assert.equal(unknown.point, null)
  assert.equal(unknown.area, null)
})

// ---------- store.ts ----------

function makeRegistration(overrides: Partial<Registration> = {}): Registration {
  const at = "2026-11-02T12:00:00.000Z"
  return {
    id: "reg-1", phone: "5215511112222", source: "webhook", name: "Org",
    roles: ["receiver"], address: null, location: null, locationSource: null, area: null,
    hours: null, hoursText: "", contacts: [], accepts: null, generates: null,
    selfPickup: null, whatsappOptIn: true, status: "pending",
    createdAt: at, updatedAt: at, verifiedAt: null, verifiedBy: null, notes: null,
    ...overrides,
  }
}

function failingStore(): RegistryStore {
  const fail = async (): Promise<never> => { throw new Error("boom") }
  return {
    kind: "firestore",
    getConversation: fail, saveConversation: fail, getRegistration: fail,
    findRegistrationByPhone: fail, saveRegistration: fail, listRegistrations: fail,
    addInbox: fail, listInbox: fail,
  }
}

test("regression: the memory store isolates saved copies from later mutations", async () => {
  const store = createMemoryStore()
  const reg = makeRegistration()
  await store.saveRegistration(reg)
  reg.name = "mutated"
  reg.roles.push("donor")
  assert.equal((await store.getRegistration("reg-1"))?.name, "Org")
  assert.deepEqual((await store.getRegistration("reg-1"))?.roles, ["receiver"])
  const fetched = await store.getRegistration("reg-1")
  fetched!.name = "mutated again"
  assert.equal((await store.getRegistration("reg-1"))?.name, "Org")
  assert.equal(await store.getRegistration("missing"), null)
  assert.equal(await store.getConversation("missing"), null)
})

test("regression: findRegistrationByPhone normalizes digits, skips rejected and prefers the newest", async () => {
  const store = createMemoryStore()
  await store.saveRegistration(makeRegistration({ id: "old", status: "verified", updatedAt: "2026-11-01T12:00:00.000Z" }))
  await store.saveRegistration(makeRegistration({ id: "new", status: "verified", updatedAt: "2026-11-03T12:00:00.000Z" }))
  await store.saveRegistration(makeRegistration({ id: "rej", status: "rejected", updatedAt: "2026-11-04T12:00:00.000Z" }))
  assert.equal((await store.findRegistrationByPhone("+52 1 55 1111-2222"))?.id, "new")
  assert.equal(await store.findRegistrationByPhone("000"), null)
})

test("regression: listRegistrations is newest-first", async () => {
  const store = createMemoryStore()
  await store.saveRegistration(makeRegistration({ id: "a", createdAt: "2026-11-01T00:00:00.000Z" }))
  await store.saveRegistration(makeRegistration({ id: "b", createdAt: "2026-11-03T00:00:00.000Z" }))
  assert.deepEqual((await store.listRegistrations()).map((r) => r.id), ["b", "a"])
})

test("regression: the inbox dedupes by id, stays newest-first and caps at 200", async () => {
  const store = createMemoryStore()
  const item = (id: string, at: string) => ({ id, at, phone: "1", source: "webhook" as const, kind: "offer" as const, summary: id, text: id, registrationId: null, feasible: 0 })
  await store.addInbox(item("x", "2026-11-01T00:00:00.000Z"))
  await store.addInbox(item("y", "2026-11-02T00:00:00.000Z"))
  await store.addInbox(item("x", "2026-11-03T00:00:00.000Z"))
  assert.deepEqual((await store.listInbox()).map((i) => i.id), ["x", "y"])
  assert.equal((await store.listInbox())[0].at, "2026-11-03T00:00:00.000Z")
  for (let i = 0; i < 205; i++) await store.addInbox(item(`n${i}`, "2026-11-04T00:00:00.000Z"))
  assert.equal((await store.listInbox(500)).length, 200)
})

test("regression: digits keeps only numbers", () => {
  assert.equal(digits("+52 (55) 1234-5678"), "525512345678")
})

test("regression: withFallback serves reads from backup and records the error", async () => {
  const backup = createMemoryStore()
  await backup.saveRegistration(makeRegistration({ id: "kept" }))
  const store = withFallback(failingStore(), backup)
  assert.equal(store.kind, "firestore")
  assert.equal((await store.getRegistration("kept"))?.id, "kept")
  assert.match(store.lastError ?? "", /firestore read failed/)
})

test("regression: withFallback writes reach the backup even when the primary fails", async () => {
  const backup = createMemoryStore()
  const store = withFallback(failingStore(), backup)
  await store.saveRegistration(makeRegistration({ id: "w" }))
  assert.equal((await backup.getRegistration("w"))?.id, "w")
  assert.match(store.lastError ?? "", /firestore write failed/)
})

test("regression: withFallback clears the error once the primary answers again", async () => {
  const primary = createMemoryStore()
  let down = true
  const flaky: RegistryStore = { ...primary, kind: "firestore", getRegistration: async (id) => { if (down) throw new Error("boom"); return primary.getRegistration(id) } }
  const store = withFallback(flaky)
  assert.equal(await store.getRegistration("x"), null)
  assert.match(store.lastError ?? "", /boom/)
  down = false
  assert.equal(await store.getRegistration("x"), null)
  assert.equal(store.lastError, null)
})

test("regression: withFallback doesn't hang on a primary that never answers", async () => {
  const pending = new Promise<never>(() => {})
  const stuck: RegistryStore = { ...createMemoryStore(), kind: "firestore", listInbox: () => pending }
  const store = withFallback(stuck, createMemoryStore(), 30)
  assert.deepEqual(await store.listInbox(), [])
  assert.match(store.lastError ?? "", /no answer/)
})

// ---------- onboarding.ts ----------

const CTX = { phone: "+52 1 55 1111 2222", source: "webhook" as const, now: new Date("2026-11-02T18:00:00.000Z") }

function answer(state: OnboardingState, text: string) {
  return continueOnboarding(state, { text, pin: null }, CTX)
}

test("regression: a donor-only onboarding skips accepts and pickup", () => {
  let o = startOnboarding(CTX.now)
  assert.equal(o.state?.step, "role")
  o = answer(o.state!, "1")
  assert.equal(o.state?.step, "name")
  o = answer(o.state!, "Panadería La Espiga")
  assert.equal(o.state?.step, "location")
  o = answer(o.state!, "Av. Álvaro Obregón 120, Roma Norte")
  assert.match(o.reply, /pasar a recoger/)
  assert.equal(o.state?.step, "hours")
  assert.deepEqual(o.state?.draft.location, { lat: 19.4194, lng: -99.1617 })
  assert.equal(o.state?.draft.locationSource, "colonia")
  o = answer(o.state!, "lunes a sábado de 9 a 6")
  assert.equal(o.state?.step, "contact")
  o = answer(o.state!, "Soy Beto")
  assert.equal(o.state?.step, "generates")
  assert.match(o.reply, /Qué les sobra/)
  o = answer(o.state!, "pan del día, 20 kg, diario")
  assert.equal(o.state?.step, "confirm")
  assert.match(o.reply, /Panadería La Espiga/)
  assert.match(o.reply, /dona alimento/)
  o = answer(o.state!, "sí")
  assert.equal(o.state, null)
  assert.equal(o.completed?.status, "pending")
  assert.equal(o.completed?.whatsappOptIn, true)
  assert.equal(o.completed?.phone, "5215511112222")
  assert.deepEqual(o.completed?.roles, ["donor"])
  assert.equal(o.completed?.generates?.frequency, "diaria")
  assert.equal(o.completed?.accepts, null)
  assert.equal(o.completed?.selfPickup, null)
  assert.match(o.reply, /ya puedes mandarme/)
})

test("regression: compost skips pickup, and confirm can restart or cancel", () => {
  let o = startOnboarding(CTX.now)
  o = answer(o.state!, "4")
  o = answer(o.state!, "Composta Roma")
  o = answer(o.state!, "Calle X 1")
  assert.match(o.reply, /pueden recibir/)
  o = answer(o.state!, "lunes a viernes de 10 a 5")
  o = answer(o.state!, "Ana")
  assert.match(o.reply, /composta/)
  o = answer(o.state!, "restos de verdura y fruta")
  assert.equal(o.state?.step, "confirm", "compost goes straight from accepts to confirm")
  assert.match(o.reply, /el equipo la ubica/)
  o = answer(o.state!, "no")
  assert.equal(o.state?.step, "role")
  assert.match(o.reply, /empecemos de nuevo/)
  o = answer(o.state!, "cancelar")
  assert.equal(o.state, null)
  assert.equal(o.cancelled, true)
})

test("regression: onboarding re-asks instead of accepting garbage", () => {
  let o = startOnboarding(CTX.now)
  o = answer(o.state!, "hola")
  assert.equal(o.state?.step, "role")
  assert.match(o.reply, /No entendí/)
  o = answer(o.state!, "2")
  o = answer(o.state!, "x")
  assert.equal(o.state?.step, "name")
  o = answer(o.state!, "se llama Comedor Luz")
  assert.equal(o.state?.draft.name, "Comedor Luz")
  o = answer(o.state!, "ab")
  assert.equal(o.state?.step, "location")
  assert.match(o.reply, /Necesito la dirección/)
  o = answer(o.state!, "Dr. Vértiz 200, Doctores")
  assert.equal(o.state?.draft.area, "doctores")
  o = answer(o.state!, "cuando se pueda")
  assert.equal(o.state?.step, "hours")
  assert.match(o.reply, /No encontré el horario/)
  o = answer(o.state!, "como a las 3")
  assert.equal(o.state?.step, "contact")
  assert.equal(o.state?.draft.hours, null)
  assert.equal(o.state?.draft.hoursText, "como a las 3")
  o = answer(o.state!, "")
  assert.equal(o.state?.step, "contact")
  assert.match(o.reply, /al menos un nombre/)
  o = answer(o.state!, "Ana")
  o = answer(o.state!, "pan y fruta")
  assert.equal(o.state?.step, "pickup")
  o = answer(o.state!, "tal vez")
  assert.equal(o.state?.step, "pickup")
  assert.match(o.reply, /No entendí/)
  o = answer(o.state!, "recogemos")
  assert.equal(o.state?.step, "confirm")
  o = answer(o.state!, "quizás")
  assert.equal(o.state?.step, "confirm")
  assert.match(o.reply, /Responde "sí" o "no"/)
})

test("regression: updating an existing registration keeps its id", () => {
  const existing = makeRegistration({ id: "reg-keep", name: "Vieja Org", status: "verified", roles: ["receiver"] })
  let o = startOnboarding(CTX.now, existing)
  assert.match(o.reply, /Ya tengo registrada a Vieja Org/)
  assert.equal(o.state?.editingId, "reg-keep")
  o = answer(o.state!, "2")
  o = answer(o.state!, "Nueva razón social")
  o = answer(o.state!, "Roma Norte 10")
  o = answer(o.state!, "lunes a viernes de 10 a 5")
  o = answer(o.state!, "Ana")
  o = answer(o.state!, "pan")
  o = answer(o.state!, "recogemos")
  o = answer(o.state!, "sí")
  assert.equal(o.completed?.id, "reg-keep")
  assert.equal(o.completed?.name, "Nueva razón social")
  assert.equal(o.completed?.status, "pending")
})

test("regression: two registrations in the same millisecond get different ids", () => {
  const run = () => {
    let o = startOnboarding(CTX.now)
    o = answer(o.state!, "1")
    o = answer(o.state!, "Org")
    o = answer(o.state!, "Roma Norte 1")
    o = answer(o.state!, "lunes a viernes de 10 a 5")
    o = answer(o.state!, "Ana")
    o = answer(o.state!, "pan, 10 kg")
    return answer(o.state!, "sí").completed!.id
  }
  assert.notEqual(run(), run())
})

test("regression: a location pin during onboarding wins over typed text", () => {
  let o = startOnboarding(CTX.now)
  o = answer(o.state!, "2")
  o = answer(o.state!, "Comedor Pin")
  o = continueOnboarding(o.state!, { text: "", pin: { point: { lat: 19.41, lng: -99.16 }, label: "Orizaba 101" } }, CTX)
  assert.equal(o.state?.step, "hours")
  assert.deepEqual(o.state?.draft.location, { lat: 19.41, lng: -99.16 })
  assert.equal(o.state?.draft.locationSource, "pin")
  assert.equal(o.state?.draft.address, "Orizaba 101")
})

test("regression: the summary renders a partial draft without crashing", () => {
  const s = summary({})
  assert.match(s, /Esto es lo que registré/)
  assert.match(s, /sin dirección/)
  assert.match(s, /el equipo la ubica/)
  assert.match(s, /sin horario/)
})

// ---------- network.ts ----------

test("regression: only verified registrations with a point become participants", () => {
  const point = { lat: 19.4194, lng: -99.1617 }
  assert.equal(toParticipant(makeRegistration({ status: "pending", location: point })), null)
  assert.equal(toParticipant(makeRegistration({ status: "verified", location: null })), null)
  assert.equal(toParticipant(makeRegistration({ status: "rejected", location: point })), null)
  assert.ok(toParticipant(makeRegistration({ status: "verified", location: point, roles: ["receiver"] })))
})

test("regression: receivers get a people need with their declared values", () => {
  const p = toParticipant(makeRegistration({
    status: "verified", location: { lat: 19.41, lng: -99.16 }, roles: ["receiver"],
    hours: { days: [1, 2], from: 600, to: 900 },
    accepts: { categories: ["panificados", "lacteos"], materials: [], requires: [], weeklyKg: 50, text: "pan" },
    selfPickup: true,
  }))!
  assert.equal(p.verified, true)
  assert.equal(p.need?.tier, "people")
  assert.deepEqual(p.need?.categories, ["panificados", "lacteos"])
  assert.deepEqual(p.need?.conditions, ["edible"])
  assert.equal(p.need?.weeklyCapacityKg, 50)
  assert.equal(p.need?.maxKg, 50)
  assert.equal(p.need?.selfPickup, true)
  assert.equal(p.need?.selfPickupMaxMinutes, 30)
  assert.deepEqual(p.need?.receiving, { days: [1, 2], from: 600, to: 900 })
})

test("regression: missing declarations fall back to named defaults, and maxKg caps at 200", () => {
  const p = toParticipant(makeRegistration({ status: "verified", location: { lat: 19.41, lng: -99.16 }, roles: ["receiver"] }))!
  assert.deepEqual(p.need?.categories, ["panificados", "verduras", "frutas", "lacteos", "abarrotes", "proteina"])
  assert.equal(p.need?.weeklyCapacityKg, 100)
  assert.equal(p.need?.maxKg, 100)
  assert.equal(p.need?.selfPickup, false)
  assert.equal(p.need?.selfPickupMaxMinutes, 0)
  assert.deepEqual(p.need?.receiving, { days: [1, 2, 3, 4, 5, 6], from: 540, to: 1080 })
  const big = toParticipant(makeRegistration({
    status: "verified", location: { lat: 19.41, lng: -99.16 }, roles: ["receiver"],
    accepts: { categories: ["panificados"], materials: [], requires: [], weeklyKg: 500, text: "mucho pan" },
  }))!
  assert.equal(big.need?.weeklyCapacityKg, 500)
  assert.equal(big.need?.maxKg, 200)
})

test("regression: makers match on materials and take non-edible conditions", () => {
  const maker = toParticipant(makeRegistration({
    status: "verified", location: { lat: 19.41, lng: -99.16 }, roles: ["maker"],
    accepts: { categories: ["organico"], materials: ["cáscara de huevo"], requires: ["limpia", "seca"], weeklyKg: 20, text: "cáscara" },
  }))!
  assert.equal(maker.need?.tier, "transformation")
  assert.deepEqual(maker.need?.categories, ["organico"])
  assert.deepEqual(maker.need?.materials, ["cáscara de huevo"])
  assert.deepEqual(maker.need?.conditions, ["inedible", "past_prime"])
  assert.deepEqual(maker.need?.requires, ["limpia", "seca"])
  const noMaterials = toParticipant(makeRegistration({ status: "verified", location: { lat: 19.41, lng: -99.16 }, roles: ["maker"] }))!
  assert.equal("materials" in noMaterials.need!, false)
})

test("regression: compost takes every condition and donors become generators", () => {
  const compost = toParticipant(makeRegistration({ status: "verified", location: { lat: 19.41, lng: -99.16 }, roles: ["compost"] }))!
  assert.equal(compost.need?.tier, "compost")
  assert.deepEqual(compost.need?.categories, ["panificados", "verduras", "frutas", "lacteos", "abarrotes", "proteina", "organico"])
  assert.deepEqual(compost.need?.conditions, ["edible", "past_prime", "inedible"])
  const donor = toParticipant(makeRegistration({
    status: "verified", location: { lat: 19.41, lng: -99.16 }, roles: ["donor"],
    generates: { categories: ["panificados"], kgPerWeek: 20, frequency: "diaria", text: "pan del día" },
  }))!
  assert.equal(donor.need, undefined)
  assert.equal(donor.generator?.impactRadiusKm, 5)
  const [stream] = donor.generator?.streams ?? []
  assert.equal(stream?.category, "panificados")
  assert.equal(stream?.kgPerWeek, 20)
  const silent = toParticipant(makeRegistration({ status: "verified", location: { lat: 19.41, lng: -99.16 }, roles: ["donor"] }))!
  assert.deepEqual(silent.generator?.streams, [])
})

test("regression: an org with several roles gets both a need and a generator", () => {
  const p = toParticipant(makeRegistration({
    status: "verified", location: { lat: 19.41, lng: -99.16 }, roles: ["receiver", "donor"],
    accepts: { categories: ["verduras"], materials: [], requires: [], weeklyKg: 30, text: "verdura" },
    generates: { categories: ["panificados"], kgPerWeek: 10, frequency: "semanal", text: "pan" },
  }))!
  assert.equal(p.need?.tier, "people")
  assert.equal(p.generator?.streams.length, 1)
})

test("regression: refreshLiveNetwork loads only what can take part, and never throws", async () => {
  const store = createMemoryStore()
  const point = { lat: 19.41, lng: -99.16 }
  await store.saveRegistration(makeRegistration({ id: "ok", status: "verified", location: point, roles: ["receiver"] }))
  await store.saveRegistration(makeRegistration({ id: "pending", status: "pending", location: point, roles: ["receiver"] }))
  await store.saveRegistration(makeRegistration({ id: "noplace", status: "verified", location: null, roles: ["receiver"] }))
  try {
    const list = await refreshLiveNetwork(store)
    assert.deepEqual(list.map((p) => p.id), ["ok"])
    assert.ok(liveNetwork().participants.some((p) => p.id === "ok"))
    assert.ok(!liveNetwork().participants.some((p) => p.id === "pending"))
  } finally {
    setRegisteredParticipants([])
  }
  assert.deepEqual(await refreshLiveNetwork(failingStore()), [])
  assert.deepEqual(registeredParticipants(), [])
})
