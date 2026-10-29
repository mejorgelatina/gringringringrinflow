import assert from "node:assert/strict"
import { test } from "node:test"

import { confirmIntake, processIntake, type IntakeDeps } from "../lib/intake/process.ts"
import { isAcceptableImageDataUrl, resolveCondition, type PhotoAssessment } from "../lib/meta/photo-policy.ts"
import type { Extraction } from "../lib/meta/types.ts"

// Real magic bytes so the server-side content check passes.
const JPEG = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString("base64")
const PNG = "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).toString("base64")

const extraction = (condition: "edible" | "unknown" = "edible"): Extraction => ({
  events: [{ kind: "supply_announced", item: "pan", category: "panificados", quantity: 20, unit: "caja", quantity_basis: "stated", condition, deadline_hour: 17, location: "Roma", unresolved: [], quote: "pan" }],
  residual_text: "",
  needs_review: false,
  review_reasons: [],
})
const clean: PhotoAssessment = { visible_items: [{ item: "bolillo", category: "panificados", approx_count: 20, packaging: null }], visible_label_text: [], visible_issues: [], visual_grade: "no_visible_issues", image_quality: "good", notes: "" }
const moldy: PhotoAssessment = { ...clean, visible_issues: [{ issue: "mold", note: "green spots on two loaves" }], visual_grade: "minor_visible_issues" }

function deps(over: Partial<IntakeDeps> & { calls?: { text: number; photo: number } } = {}): IntakeDeps & { calls: { text: number; photo: number } } {
  const calls = over.calls ?? { text: 0, photo: 0 }
  return {
    useMeta: true,
    modelId: "m",
    visionModelId: "v",
    extractWithMeta: async () => { calls.text++; return extraction() },
    extractLocally: () => extraction(),
    assessPhotoWithMeta: async () => { calls.photo++; return clean },
    ...over,
    calls,
  }
}
const peopleFeasible = (r: { candidates: { tier: string; feasible: boolean }[] }) => r.candidates.some(c => c.tier === "people" && c.feasible)

test("IMG-01: a clean photo keeps the donor's statement and never upgrades unknown to edible", async () => {
  const r = await processIntake("pan", JPEG, deps({ extractWithMeta: async () => extraction("unknown") }))
  assert.equal(r.condition?.effective, "unknown")
  assert.equal(peopleFeasible(r), false)
})

test("IMG-02/05: visible mold blocks people routes even when the message says fresh", async () => {
  const r = await processIntake("pan fresco", JPEG, deps({ assessPhotoWithMeta: async () => moldy }))
  assert.equal(r.condition?.stated, "edible")
  assert.equal(r.condition?.effective, "unknown")
  assert.equal(r.condition?.peopleRouteBlocked, true)
  assert.equal(peopleFeasible(r), false)
  assert.ok(r.extraction.needs_review)
})

test("IMG-11/12: a failed or malformed vision call fails closed, once, with no retry", async () => {
  const d = deps({ assessPhotoWithMeta: async () => { d.calls.photo++; throw new SyntaxError("bad json") } })
  const r = await processIntake("pan fresco", JPEG, d)
  assert.equal(d.calls.photo, 1)
  assert.equal(r.photo?.status, "failed")
  assert.equal(r.condition?.effective, "unknown")
  assert.equal(peopleFeasible(r), false)
})

test("IMG-13/14: with Meta off, no model function is called and the result is labelled local", async () => {
  const d = deps({ useMeta: false })
  const r = await processIntake("pan", JPEG, d)
  assert.deepEqual(d.calls, { text: 0, photo: 0 })
  assert.equal(r.metaCalls, 0)
  assert.match(r.provider, /Local demo fallback/)
  assert.equal(r.photo?.status === "assessed" && r.photo.assessment.visual_grade, "unclear_photo")
})

test("IMG-15: with Meta on, one message plus one photo is exactly two calls", async () => {
  const d = deps()
  const r = await processIntake("pan", PNG, d)
  assert.deepEqual(d.calls, { text: 1, photo: 1 })
  assert.equal(r.metaCalls, 2)
})

test("IMG-08/10: renamed or corrupt files are rejected before any model call", () => {
  const exe = "data:image/jpeg;base64," + Buffer.from("MZ\x90\x00 this is not a jpeg").toString("base64")
  assert.equal(isAcceptableImageDataUrl(exe), false)
  assert.equal(isAcceptableImageDataUrl("data:image/png;base64," + JPEG.split(",")[1]), false)
  assert.equal(isAcceptableImageDataUrl(JPEG), true)
  assert.equal(isAcceptableImageDataUrl(PNG), true)
})

test("IMG-16: a person confirming the lot is not for people keeps people routes blocked", async () => {
  const r = await processIntake("pan fresco", JPEG, deps({ assessPhotoWithMeta: async () => moldy }))
  const c = confirmIntake(r.supply!, "edible", "past_prime", { condition: "inedible", reviewer: "Ana", at: "2026-10-29T15:00:00Z" })
  assert.equal(c.condition.effective, "inedible")
  assert.equal(peopleFeasible(c), false)
  assert.ok(c.candidates.some(x => x.tier === "valorization" && x.feasible))
})

test("IMG-17: a person's confirmation is recorded next to the model observation, not over it", () => {
  const e = resolveCondition("edible", "past_prime", { condition: "edible", reviewer: "Ana", at: "2026-10-29T15:00:00Z", note: "only two loaves affected, removed" })
  assert.equal(e.observed, "past_prime")
  assert.equal(e.humanConfirmed?.reviewer, "Ana")
  assert.equal(e.effective, "edible")
  assert.equal(e.peopleRouteBlocked, false)
})

test("operator can confirm an estimated quantity, which clears that blocker", async () => {
  const est = extraction()
  est.events[0].quantity_basis = "estimated"
  const r = await processIntake("pan", undefined, deps({ extractWithMeta: async () => est }))
  assert.ok(r.candidates.every(c => c.blockers.some(b => b.code === "quantity_estimated")))
  const c = confirmIntake(r.supply!, "edible", "not_assessed", { condition: "edible", reviewer: "Ana", at: "t" }, 20)
  assert.equal(c.supply.quantityBasis, "confirmed")
  assert.ok(c.candidates.every(x => !x.blockers.some(b => b.code === "quantity_estimated")))
})

test("offline fixtures are labelled, never used when Meta is on, and mold still blocks people routes", async () => {
  const off = await processIntake("pan fresco", JPEG, deps({ useMeta: false }), "mold")
  assert.equal(off.photo?.provider, "Simulated photo fixture (no model call)")
  assert.equal(off.metaCalls, 0)
  assert.equal(peopleFeasible(off), false)
  const d = deps()
  const on = await processIntake("pan", JPEG, d, "mold")
  assert.equal(d.calls.photo, 1)
  assert.equal(on.photo?.status === "assessed" && on.photo.assessment.visual_grade, "no_visible_issues")
})
