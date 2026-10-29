import assert from "node:assert/strict"
import { test } from "node:test"

import { assessPhotoLocally, isAcceptableImageDataUrl, PhotoAssessmentSchema, routePhotoAssessment, type PhotoAssessment } from "../lib/meta/photo-policy.ts"

const base: PhotoAssessment = { visible_items: [{ item: "bolillo", category: "panificados", approx_count: 40, packaging: "plastic crates" }], visible_label_text: [], visible_issues: [], visual_grade: "no_visible_issues", image_quality: "good", notes: "" }

test("a clean-looking photo never makes food edible", () => {
  const r = routePhotoAssessment(base)
  assert.equal(r.suggestedCondition, "unknown")
  assert.equal(r.humanConfirmationRequired, true)
  assert.match(r.questionForDonor, /can't confirm/)
})

test("severe visible issues suggest inedible", () => {
  const r = routePhotoAssessment({ ...base, visible_issues: [{ issue: "mold", note: "green spots" }], visual_grade: "minor_visible_issues" })
  assert.equal(r.suggestedCondition, "inedible")
})

test("minor issues suggest past prime", () => {
  const r = routePhotoAssessment({ ...base, visible_issues: [{ issue: "bruising", note: "" }], visual_grade: "minor_visible_issues" })
  assert.equal(r.suggestedCondition, "past_prime")
})

test("local fallback analyzes nothing and claims nothing", () => {
  const a = PhotoAssessmentSchema.parse(assessPhotoLocally())
  assert.equal(a.visual_grade, "unclear_photo")
  assert.equal(routePhotoAssessment(a).suggestedCondition, "unknown")
})

test("image data URLs are restricted by type and size", () => {
  assert.ok(isAcceptableImageDataUrl("data:image/jpeg;base64,AAAA"))
  assert.ok(!isAcceptableImageDataUrl("data:image/svg+xml;base64,AAAA"))
  assert.ok(!isAcceptableImageDataUrl("https://example.com/a.jpg"))
  assert.ok(!isAcceptableImageDataUrl("data:image/jpeg;base64," + "A".repeat(3_000_001)))
})

test("schema rejects a model trying to assert safety", () => {
  assert.throws(() => PhotoAssessmentSchema.parse({ ...base, visual_grade: "safe_to_eat" }))
})
