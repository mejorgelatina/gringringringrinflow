import assert from "node:assert/strict"
import { test } from "node:test"

import type { IntakeDeps } from "../lib/intake/process.ts"
import { extractLocally } from "../lib/meta/meta.ts"
import { webInbound } from "../lib/channel/web-inbound.ts"
import { handleInbound } from "../lib/whatsapp/handler.ts"
import { createMemoryStore, type RegistryStore } from "../lib/registry/store.ts"

// Plan B without whatsapp: everything the channel does must also work from the /send web chat.
// The route itself can't be imported in tests (it uses the @/ alias), so these drive the exact
// same path the route takes: webInbound() builds the message, handleInbound runs it with the
// per-tab session key the page sends.

const deps: IntakeDeps = {
  useMeta: false, modelId: null, visionModelId: null,
  extractWithMeta: async () => { throw new Error("must not be called") },
  extractLocally,
  assessPhotoWithMeta: async () => { throw new Error("must not be called") },
}

let n = 0
function webchat(store: RegistryStore, session = `tab-${n++}`) {
  return async (text: string, opts: { image?: string; location?: { lat: number; lng: number; label: string } } = {}) => {
    const { msg, useImage } = webInbound({
      id: `web-${n++}`, timestamp: "1", text,
      image: opts.image ?? null,
      location: opts.location ?? null,
    })
    return handleInbound(msg, {
      deps, allowlist: undefined, send: null,
      fetchMedia: useImage && opts.image ? async () => opts.image! : null,
      source: "web", store, conversationKey: `web:${session}`,
    })
  }
}

test("web-inbound mapping: text, photo and location become the right message type", () => {
  const text = webInbound({ id: "a", timestamp: "1", text: "hola", image: null, location: null })
  assert.equal(text.msg.type, "text")
  assert.equal(text.msg.mediaId, null)
  assert.equal(text.useImage, false)
  const photo = webInbound({ id: "b", timestamp: "1", text: "", image: "data:image/jpeg;base64,x", location: null })
  assert.equal(photo.msg.type, "image")
  assert.equal(photo.msg.mediaId, "web")
  assert.equal(photo.useImage, true)
  const pin = webInbound({ id: "c", timestamp: "1", text: "", image: null, location: { lat: 19.41, lng: -99.16, label: "" } })
  assert.equal(pin.msg.type, "location")
  assert.deepEqual(pin.msg.location, { lat: 19.41, lng: -99.16, label: "" })
  assert.equal(pin.msg.mediaId, null)
  assert.equal(pin.useImage, false)
  const both = webInbound({ id: "d", timestamp: "1", text: "", image: "data:image/jpeg;base64,x", location: { lat: 19.41, lng: -99.16, label: "x" } })
  assert.equal(both.msg.type, "location", "a pin answers where; it wins over a photo")
  assert.equal(both.useImage, false)
})

test("web registration: full onboarding with a shared pin, no whatsapp involved", async () => {
  const store = createMemoryStore()
  const say = webchat(store, "tab-reg")
  let t = await say("quiero registrar mi organización")
  assert.match(t.reply!, /¿Qué hace tu organización\?/)
  t = await say("2")
  assert.match(t.reply!, /¿Cómo se llama/)
  t = await say("Comedor Web Roma")
  assert.match(t.reply!, /ubicación/)
  t = await say("", { location: { lat: 19.4185, lng: -99.1625, label: "" } })
  assert.match(t.reply!, /horario pueden recibir/)
  t = await say("lunes a sábado de 12 a 7")
  t = await say("Mariana López")
  t = await say("pan, fruta y verdura, unos 80 kg por semana")
  t = await say("recogemos")
  assert.match(t.reply!, /Esto es lo que registré/)
  t = await say("sí")
  assert.match(t.reply!, /Quedó registrado/)
  assert.ok(t.onboarding?.registrationId)
  const [reg] = await store.listRegistrations()
  assert.equal(reg.status, "pending")
  assert.equal(reg.source, "web")
  assert.equal(reg.locationSource, "pin")
  assert.deepEqual(reg.location, { lat: 19.4185, lng: -99.1625 })
  assert.ok((await store.listInbox()).some((i) => i.kind === "registration"))
})

test("web memory: a follow-up completes the offer through the tab session", async () => {
  const store = createMemoryStore()
  const say = webchat(store, "tab-offer")
  const first = await say("Tenemos 20 cajas de pan fresco")
  assert.match(first.reply!, /\?/)
  const second = await say("en la colonia Roma, hay que recogerlas antes de las 6 pm")
  assert.ok(second.steps.some((s) => s.step === "memory" && /continuing/.test(s.detail)))
  assert.equal(second.intake?.supply?.quantity, 20)
  assert.equal(second.intake?.supply?.location?.toLowerCase(), "roma")
  assert.equal(second.intake?.supply?.deadlineHour, 18)
  assert.equal((await store.listInbox()).filter((i) => i.kind === "offer").length, 1)
})

test("web pin: a shared location becomes the pickup point", async () => {
  const store = createMemoryStore()
  const say = webchat(store, "tab-pin")
  await say("Tenemos 20 cajas de pan fresco, recoger antes de las 6 pm")
  const t = await say("", { location: { lat: 19.4167, lng: -99.1453, label: "" } })
  assert.ok(t.steps.some((s) => s.step === "origin" && /pin/.test(s.detail)))
  assert.deepEqual(t.intake?.supply?.point, { lat: 19.4167, lng: -99.1453 })
})
