import assert from "node:assert/strict"
import { test } from "node:test"

import type { IntakeDeps } from "../lib/intake/process.ts"
import { processIntake } from "../lib/intake/process.ts"
import { extractLocally } from "../lib/meta/meta.ts"
import { handleInbound, recentTraces, recordTrace } from "../lib/whatsapp/handler.ts"

const localDeps = (): IntakeDeps => ({
  useMeta: false, modelId: null, visionModelId: null,
  extractWithMeta: async () => { throw new Error("must not be called") },
  extractLocally,
  assessPhotoWithMeta: async () => { throw new Error("must not be called") },
})
const web = (id: string, text: string) => handleInbound({ id, from: "web", timestamp: "1", type: "text", text, mediaId: null }, { deps: localDeps(), allowlist: undefined, send: null, fetchMedia: null, source: "web" })

test("an organization that can receive food is demand, not a supply offer", async () => {
  const r = await processIntake("Somos un comedor en la colonia Roma, podemos recibir 30 kilos de verdura hasta las 5 pm", undefined, localDeps())
  assert.equal(r.supply, null)
  assert.equal(r.candidates.length, 0)
  assert.deepEqual(r.demand, { category: "verduras", quantity: 30, unit: "kg", untilHour: 17, location: "roma" })
})

test("demand reply restates what was noted and invites an unregistered org to register, verified by a person", async () => {
  const t = await web("w1", "Somos un comedor en la colonia Roma, podemos recibir 30 kilos de verdura hasta las 5 pm")
  assert.match(t.reply!, /puede recibir: 30 kg, verduras, en Roma, hasta las 17:00/)
  assert.match(t.reply!, /registra tu organización: escribe "registrar"\. Una persona del equipo la verifica/)
  assert.ok(t.steps.some(s => /receiving organization drafted/.test(s.detail)))
})

test("demand with missing details asks the first missing one", async () => {
  const t = await web("w2", "hola grinflow, mi organización puede recibir comida")
  assert.match(t.reply!, /¿Cuánto pueden recibir/)
})

test("golden-set needs are read as demand by the local fallback", () => {
  for (const body of ["necesitamos verdura para 80 despensas el viernes", "necesito 4 despensas", "buenas, de parte del comedor: nos hacen falta como 15 kilos de fruta para el jueves"]) {
    assert.equal(extractLocally(body).events[0].kind, "demand_declared", body)
  }
  assert.equal(extractLocally("Tenemos 20 cajas de pan fresco en la colonia Roma").events[0].kind, "supply_announced")
})

test("a first hola (from the qr) gets the two options, and an intent to give asks for details", async () => {
  assert.match((await web("w3", "hola")).reply!, /comida para donar, o tu organización puede recibir/)
  assert.match((await web("w4", "hola grinflow, tengo comida para donar")).reply!, /qué alimento es, cuánto hay, dónde está/)
  assert.match((await web("w5", "hi")).reply!, /food to give, or can your organization receive/)
})

test("web traces come from real people, so the public view withholds their content", async () => {
  const t = await web("w6", "Tenemos 20 cajas de pan en la colonia Roma")
  recordTrace(t)
  const pub = recentTraces().find(x => x.id === "w6")!
  assert.equal(pub.reply, "(withheld: real sender)")
  assert.equal(pub.intake?.supply, null)
})
