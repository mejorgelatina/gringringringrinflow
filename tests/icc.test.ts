import assert from "node:assert/strict"
import { test } from "node:test"

import { characterize, planningWeight } from "../lib/icc/characterize.ts"
import { intakeMetrics } from "../lib/icc/metrics.ts"
import { ICC_WEIGHTS_STATUS, UNIT_REFERENCES } from "../lib/icc/spec.ts"
import type { IccRecord } from "../lib/icc/types.ts"
import { confirmIntake, processIntake, type IntakeDeps } from "../lib/intake/process.ts"
import { localJudge } from "../lib/agent/judge.ts"
import { resumeRun, startRun } from "../lib/agent/loop.ts"
import { createScriptedPlanner, type Planner, type PlannerStep } from "../lib/agent/planner.ts"
import type { AgentDeps } from "../lib/agent/tools.ts"
import type { AgentRun } from "../lib/agent/types.ts"
import { extractLocally } from "../lib/meta/meta.ts"
import { handleInbound } from "../lib/whatsapp/handler.ts"

// Every test runs offline: no key, no network, no Meta credits. Photos use labelled fixtures.
const JPEG = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString("base64")
const deps: IntakeDeps = {
  useMeta: false, modelId: null, visionModelId: null,
  extractWithMeta: async () => { throw new Error("no network in tests") },
  extractLocally,
  assessPhotoWithMeta: async () => { throw new Error("no network in tests") },
}
const agentDeps = (over: Partial<AgentDeps> = {}): AgentDeps => ({ ...deps, judge: localJudge, ...over })

/** Every value in a record, so a test can check that nothing was promoted to measured or verified. */
function provenances(icc: IccRecord): string[] {
  const vals = [icc.physical.count, icc.physical.weightKg, icc.physical.volumeM3, icc.quality.condition, icc.quality.visual, icc.quality.storage, icc.product.packaging]
  return vals.filter(Boolean).map((v) => v!.provenance)
}

// ── the three scenarios jor asked for ─────────────────────────────────────────────

test("ICC-1: declared weight and count stay declarado, and the lot reaches the network with that weight", async () => {
  const r = await processIntake("Tenemos 40 kg de pan fresco en 20 cajas, en la colonia Roma, recoger antes de las 6 pm.", undefined, deps, undefined, "whatsapp")
  const icc = r.icc!
  assert.equal(icc.channel, "whatsapp")
  assert.deepEqual(icc.physical.weightKg?.value, { min: 40, max: 40, point: 40 })
  assert.equal(icc.physical.weightKg?.provenance, "declarado")
  assert.deepEqual(icc.physical.weightKg?.evidence, [{ kind: "texto", ref: "40 kg" }])
  assert.deepEqual(icc.physical.count?.value, { count: 20, unit: "caja" })
  assert.equal(icc.physical.count?.provenance, "declarado")
  // a photo-free volume can only be estimated
  assert.equal(icc.physical.volumeM3?.provenance, "estimado")
  assert.ok(!provenances(icc).includes("medido") && !provenances(icc).includes("verificado"))
  assert.equal(icc.eligibility.people.status, "elegible")
  assert.match(icc.eligibility.people.reasons[0], /no certifica inocuidad/)
  assert.ok(icc.risk.pendingVerifications.some((p) => /báscula/.test(p)))
  assert.deepEqual(icc.missing, [])
  const best = r.candidates.find((c) => c.feasible)!
  assert.equal(best.recipientId, "rec-doctores")
  assert.ok(!(best.warnings ?? []).some((w) => w.code === "weight_estimated"))
})

test("ICC-2: a photo of food containers with no count or weight gives an estimated count and weight, and asks for the rest", async () => {
  const r = await processIntake("Nos quedaron estas cajas de comida. Las pueden recoger hoy.", JPEG, deps, "containers", "whatsapp")
  const icc = r.icc!
  assert.equal(r.supply?.quantitySource, "foto")
  assert.deepEqual(icc.physical.count?.value, { count: 12, unit: "contenedor" })
  assert.equal(icc.physical.count?.provenance, "estimado")
  assert.equal(icc.physical.count?.evidence[0].kind, "foto")
  assert.equal(icc.physical.weightKg?.provenance, "estimado")
  assert.equal(icc.physical.weightKg?.confidence, "baja")
  assert.ok(icc.physical.weightKg!.value.min < icc.physical.weightKg!.value.max, "an estimate is a range, not a number")
  assert.equal(icc.quality.visual?.provenance, "estimado")
  // a clean-looking photo does not make food safe
  assert.equal(icc.quality.condition.value, "unknown")
  assert.notEqual(icc.eligibility.people.status, "elegible")
  assert.deepEqual(icc.missing.map((m) => m.field), ["category", "quantity", "location", "deadline_hour", "condition"])
  assert.ok(!provenances(icc).includes("medido") && !provenances(icc).includes("verificado"))
  // it still reaches the engine: every row is blocked, with the reasons
  assert.ok(r.candidates.length > 0 && r.candidates.every((c) => !c.feasible))
  assert.ok(r.candidates.every((c) => c.blockers.some((b) => b.code === "quantity_estimated")))
})

test("ICC-3: an approximate count keeps quantity, weight and volume uncertain, and the lot is evaluated but not committed", async () => {
  const r = await processIntake("Nos sobraron como unas 15 cajas de jitomate en Centro, antes de las 5 pm", undefined, deps, undefined, "intake")
  const icc = r.icc!
  assert.equal(icc.physical.count?.provenance, "estimado")
  assert.equal(icc.physical.weightKg?.provenance, "estimado")
  assert.equal(icc.physical.volumeM3?.provenance, "estimado")
  assert.match(icc.physical.weightKg!.method, /referencia por unidad \(verdura-caja\)/)
  assert.ok(icc.physical.weightKg!.evidence.some((e) => e.kind === "referencia" && /placeholder/.test(e.ref)))
  assert.equal(icc.missing[0].field, "quantity")
  assert.ok(r.candidates.every((c) => !c.feasible && c.blockers.some((b) => b.code === "quantity_estimated")))
  assert.ok(!provenances(icc).includes("medido") && !provenances(icc).includes("verificado"))
})

// ── provenance moves only with a person or an instrument ─────────────────────────

test("an operator's weight is verificado and replaces the estimate; nothing else changes provenance", async () => {
  const r = await processIntake("Tenemos 20 cajas de pan fresco en la colonia Roma, antes de las 6 pm", undefined, deps)
  assert.equal(r.icc!.physical.weightKg?.provenance, "estimado")
  const c = confirmIntake(r.supply!, "edible", "not_assessed", { condition: "edible", reviewer: "ana", at: "2026-11-03T15:00:00Z" }, undefined, "Tenemos 20 cajas de pan fresco", 37)
  assert.deepEqual(c.icc.physical.weightKg?.value, { min: 37, max: 37, point: 37 })
  assert.equal(c.icc.physical.weightKg?.provenance, "verificado")
  assert.equal(c.icc.physical.weightKg?.validatedBy, "ana")
  assert.equal(c.icc.quality.condition.provenance, "verificado")
})

test("a count with no unit reference gives no weight: the engine is blocked and the donor is asked", async () => {
  const r = await processIntake("Tenemos 5 tarimas de pan fresco en la colonia Roma, antes de las 6 pm", undefined, deps)
  assert.equal(r.icc!.physical.weightKg, null)
  assert.equal(planningWeight(r.icc!), null)
  assert.ok(r.icc!.missing.some((m) => m.field === "weight"))
  assert.ok(r.candidates.every((c) => !c.feasible && c.blockers.some((b) => b.code === "weight_unknown")))
})

// ── eligibility for the three destinations ───────────────────────────────────────

test("eligibility: people / transformation / compost each say what qualifies the lot and what is missing", () => {
  const base = { channel: "network" as const, now: () => "2026-11-03T12:00:00Z" }
  const shells = characterize({ ...base, text: "12 kg de cáscara de huevo limpia y seca", supply: { item: "cáscara de huevo", category: "organico", quantity: 12, unit: "kg", quantityBasis: "stated", condition: "inedible", deadlineHour: 13, location: "condesa" }, attributes: ["limpia", "seca"] })
  assert.deepEqual([shells.eligibility.people.status, shells.eligibility.transformation.status, shells.eligibility.compost.status], ["no_elegible", "elegible", "elegible"])
  const mixed = characterize({ ...base, text: "costales de cáscaras mixtas", supply: { item: "cáscaras mixtas", category: "organico", quantity: 4, unit: "costal", quantityBasis: "stated", condition: "inedible", deadlineHour: 15, location: "roma sur" }, attributes: ["mezclado"] })
  assert.equal(mixed.eligibility.transformation.status, "no_elegible")
  assert.equal(mixed.physical.weightKg?.provenance, "estimado")
  const milk = characterize({ ...base, text: "3 cajas de leche en buen estado", supply: { item: "leche", category: "lacteos", quantity: 3, unit: "caja", quantityBasis: "stated", condition: "edible", deadlineHour: 18, location: "roma" } })
  assert.equal(milk.eligibility.people.status, "condicionado")
  assert.ok(milk.missing.some((m) => m.field === "storage"))
  assert.ok(milk.risk.flags.some((f) => f.code === "cadena_de_frio_desconocida"))
  const cold = characterize({ ...base, text: "3 cajas de leche en buen estado, refrigeradas", supply: { item: "leche", category: "lacteos", quantity: 3, unit: "caja", quantityBasis: "stated", condition: "edible", deadlineHour: 18, location: "roma" } })
  assert.equal(cold.eligibility.people.status, "elegible")
})

test("icc score: three factors with provenance, provisional weights, and a range while a factor is missing", () => {
  assert.equal(ICC_WEIGHTS_STATUS, "provisional")
  const icc = characterize({ channel: "network", text: "20 cajas de pan fresco", supply: { item: "pan", category: "panificados", quantity: 20, unit: "caja", quantityBasis: "stated", condition: "edible", deadlineHour: 18, location: "roma" } })
  const c = icc.composite
  assert.equal(c.status, "calculado")
  assert.deepEqual(c.factors.map((f) => f.factor), ["tiempo", "integridad", "termico"])
  assert.equal(c.factors[0].provenance, "estimado") // "fresco" is the donor's word for today, not a timestamp
  assert.equal(c.factors[1].value, null) // no photo, no packaging: unknown, not assumed
  assert.ok(c.range!.min < c.score! && c.score! < c.range!.max)
  assert.equal(c.band, "medio") // never "alto" with a factor missing
  assert.match(c.reason, /sin banda alta mientras falte: integridad|integridad sin dato/)
  assert.ok(UNIT_REFERENCES.every((u) => /placeholder/.test(u.note)))
})

test("icc bands: full evidence reaches alto; perishables out of the cold chain fall to bajo; safety caps the score", async () => {
  const alto = await processIntake("Tenemos 40 kg de pan fresco sellado, hecho hace 2 horas, en la colonia Roma, antes de las 6 pm", JPEG, deps, "clean")
  assert.equal(alto.icc!.composite.band, "alto")
  assert.ok(alto.icc!.composite.score! >= 80)
  const warm = characterize({ channel: "network", text: "3 cajas de leche en buen estado a temperatura ambiente desde ayer", supply: { item: "leche", category: "lacteos", quantity: 3, unit: "caja", quantityBasis: "stated", condition: "edible", deadlineHour: 18, location: "roma" } })
  assert.equal(warm.composite.band, "bajo")
  const eggs = characterize({ channel: "network", text: "3 cajas de huevos echados a perder", supply: { item: "huevos", category: "proteina", quantity: 3, unit: "caja", quantityBasis: "stated", condition: "inedible", deadlineHour: 18, location: "roma" } })
  assert.equal(eggs.composite.band, "bajo")
  assert.ok(eggs.composite.range!.max < 40)
  const unknown = characterize({ channel: "network", text: "20 cajas de pan del día", supply: { item: "pan", category: "panificados", quantity: 20, unit: "caja", quantityBasis: "stated", condition: "unknown", deadlineHour: 18, location: "roma" } })
  assert.equal(unknown.composite.band, "pendiente") // a high score never stands in for a confirmed condition
})

test("icc routing: bajo leaves the food route; medio only reaches close same-day kitchens; alto-only receivers skip medio", async () => {
  const medio = await processIntake("Tenemos 20 cajas de pan fresco en la colonia Roma, antes de las 6 pm", undefined, deps)
  assert.equal(medio.icc!.composite.band, "medio")
  const narvarte = medio.candidates.filter((c) => c.recipientId === "rec-narvarte")
  assert.ok(narvarte.every((c) => !c.feasible && c.blockers.some((b) => b.code === "icc_band_not_accepted")))
  assert.ok(medio.candidates.some((c) => c.recipientId === "rec-doctores" && c.feasible))
  const alto = await processIntake("Tenemos 40 kg de pan fresco sellado, hecho hace 2 horas, en la colonia Roma, antes de las 6 pm", JPEG, deps, "clean")
  assert.ok(!alto.candidates.some((c) => c.blockers.some((b) => b.code.startsWith("icc_"))), "alto is not filtered by band")
  const warm = await processIntake("Tenemos 3 cajas de leche en buen estado a temperatura ambiente desde ayer, en la colonia Roma, antes de las 6 pm", undefined, deps)
  assert.equal(warm.icc!.composite.band, "bajo")
  assert.ok(warm.candidates.filter((c) => c.tier === "people").every((c) => !c.feasible))
})

// ── the agent: asks only for what is missing, never invents a weight ─────────────

test("agent: a photo with no count makes the agent say what it saw and ask for count and weight in one question", async () => {
  const run = await startRun("Nos quedaron estas cajas de comida. Las pueden recoger hoy.", JPEG, agentDeps({ photoFixture: "containers" }), createScriptedPlanner())
  assert.equal(run.status, "needs_input")
  assert.equal(run.question?.field, "quantity")
  assert.match(run.question!.text, /aproximadamente 12 contenedores/)
  assert.match(run.question!.text, /peso confirmado/)
  assert.match(run.question!.text, /estimado/)
  assert.equal(run.icc?.physical.count?.provenance, "estimado")
})

function scripted(steps: PlannerStep[]): Planner {
  let i = 0
  return { name: "test planner", usesMeta: true, async next(_run: AgentRun) { const s = steps[i++]; if (!s) throw new Error("script ended"); return s } }
}
const call = (name: string, args: Record<string, unknown> = {}): PlannerStep => ({ kind: "call", callId: `c_${name}_${Math.random()}`, name, arguments: JSON.stringify(args) })
const BREAD = "Tenemos 20 cajas de pan fresco en la colonia Roma, hay que recogerlas antes de las 6 pm."

test("agent: a weight stated as fact when ICC only has an estimate is refused, and so is any weight when none is known", async () => {
  const run = await startRun(BREAD, undefined, agentDeps(), scripted([
    call("extract_event"), call("find_matches"),
    call("propose_match", { recipientId: "rec-doctores", capacityId: "pickup", rationale: "40 kg de pan para el comedor doctores.", quotes: ["20 cajas de pan"] }),
    call("propose_match", { recipientId: "rec-doctores", capacityId: "pickup", rationale: "20 cajas de pan, ~40 kg estimado, para el comedor doctores.", quotes: ["20 cajas de pan"] }),
  ]))
  assert.equal(run.turns[2].check, "proposal_rules")
  assert.match(run.turns[2].summary, /estimate/)
  assert.equal(run.status, "awaiting_approval")

  const pallets = await startRun("Tenemos 5 tarimas de pan fresco en la colonia Roma, antes de las 6 pm", undefined, agentDeps(), scripted([
    call("extract_event"), call("find_matches"),
    call("ask_donor", { field: "location", question: "¿dónde?" }),
    call("ask_donor", { field: "weight", question: "¿tienen el peso total en kilos?" }),
  ]))
  assert.equal(pallets.turns[2].check, "question_check")
  assert.equal(pallets.question?.field, "weight")
})

test("agent: the scripted planner asks for the weight when no reference exists, and a declared weight unblocks the lot", async () => {
  const run = await startRun("Tenemos 5 tarimas de pan fresco en la colonia Roma, antes de las 6 pm", undefined, agentDeps(), createScriptedPlanner())
  assert.equal(run.question?.field, "weight")
  const next = await resumeRun(run, { type: "donor_reply", text: "son como 35 kg en total" }, agentDeps(), createScriptedPlanner())
  // "como 35 kg" is the donor's own approximation: estimado, but enough to plan with, labelled
  assert.equal(next.icc?.physical.weightKg?.provenance, "estimado")
  assert.equal(next.icc?.physical.weightKg?.value.point, 35)
  assert.equal(next.status, "awaiting_approval")
})

test("agent: asking for a weight the donor already declared is refused", async () => {
  const run = await startRun("Tenemos 40 kg de pan fresco en 20 cajas, en la colonia Roma, antes de las 6 pm.", undefined, agentDeps(), scripted([
    call("extract_event"), call("ask_donor", { field: "weight", question: "¿cuánto pesa?" }),
  ]))
  assert.equal(run.turns[1].check, "question_check")
  assert.match(run.turns[1].summary, /already known/)
})

test("whatsapp: the photo-only message gets the count it saw, an honest weight question, and the ICC step in the trace", async () => {
  const t = await handleInbound({ id: "icc-1", from: "5215512345678", timestamp: "1", type: "image", text: "Nos quedaron estas cajas de comida. Las pueden recoger hoy.", mediaId: "m" }, { deps, allowlist: undefined, send: null, fetchMedia: async () => JPEG, photoFixture: "containers", source: "simulator" })
  assert.match(t.reply!, /aproximadamente 12 contenedores/)
  assert.match(t.reply!, /no tengo el peso confirmado/)
  assert.ok(t.steps.some((s) => s.step === "icc" && /estimado/.test(s.detail)))
})

test("time to structured resource and the other intake metrics are computed from the records", () => {
  const icc = (rec: string, str: string) => ({ ...characterize({ channel: "whatsapp", text: "20 cajas de pan", supply: { item: "pan", category: "panificados", quantity: 20, unit: "caja", quantityBasis: "stated", condition: "edible", deadlineHour: 18, location: "roma" }, receivedAt: rec, now: () => str }) })
  const m = intakeMetrics([
    { icc: icc("2026-11-03T12:00:00.000Z", "2026-11-03T12:00:04.000Z"), captureStartedAt: "2026-11-03T11:59:57.000Z", actionableAt: "2026-11-03T12:00:04.000Z", humanCorrected: false, typed: false },
    { icc: icc("2026-11-03T13:00:00.000Z", "2026-11-03T13:00:08.000Z"), actionableAt: "2026-11-03T13:02:00.000Z", humanCorrected: true, typed: true },
  ])
  assert.equal(m.timeToStructuredResourceMs, 6000)
  assert.equal(m.timeToCaptureMs, 3000)
  assert.equal(m.timeToActionableResourceMs, (4000 + 120000) / 2)
  assert.equal(m.humanCorrectionRate, 0.5)
  assert.equal(m.completionWithoutTypingRate, 0.5)
})
