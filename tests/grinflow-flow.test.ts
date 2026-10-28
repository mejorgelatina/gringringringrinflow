import assert from "node:assert/strict"
import { test } from "node:test"

import { DEMO_ACTORS, DEMO_DAY, DEMO_DESTINATIONS, DEMO_VEHICLES, demoOffer } from "../lib/grinflow/demo-data.ts"
import { FlowError } from "../lib/grinflow/errors.ts"
import {
  answerInteraction,
  cancelInteraction,
  expireInteractions,
  proposeDestinations,
  receiveOffer,
  recordDecision,
  requestInformation,
  reviewRoute,
} from "../lib/grinflow/flow.ts"
import { identifyGaps } from "../lib/grinflow/gaps.ts"
import { evaluate, onlyNeedsRouteReview } from "../lib/grinflow/match.ts"
import type { OfferCase } from "../lib/grinflow/types.ts"

const t = (hhmm: string) => `${DEMO_DAY}T${hhmm}:00.000Z`
const { donor, operator, driver } = DEMO_ACTORS
const D = DEMO_DESTINATIONS
const V = DEMO_VEHICLES

const DEFAULT_ANSWERS: Record<string, { responseId: string; text?: string }> = {
  quantity: { responseId: "confirm" },
  weightKg: { responseId: "provide_value", text: "60" },
  condition: { responseId: "edible" },
  pickupWindow: { responseId: "confirm" },
}

function answerAll(c: OfferCase, now: string): OfferCase {
  let next = c
  for (const i of c.interactions.filter((x) => x.status === "pending")) {
    next = answerInteraction(next, i.id, donor, DEFAULT_ANSWERS[i.field], now)
  }
  return next
}

function readyCase(): OfferCase {
  const c = requestInformation(receiveOffer(demoOffer(), t("17:00")), t("17:01"))
  return answerAll(c, t("17:05"))
}

function proposedCase(): OfferCase {
  let c = proposeDestinations(readyCase(), D, V, t("17:10"))
  c = reviewRoute(c, operator, c.proposals.find(onlyNeedsRouteReview)!.id, D, V, t("17:11"))
  return c
}

function expectFlowError(fn: () => unknown, code: string) {
  assert.throws(fn, (e: unknown) => e instanceof FlowError && e.code === code)
}

test("an incoming offer lists what is missing and what must be confirmed", () => {
  const gaps = identifyGaps(demoOffer())
  assert.deepEqual(
    gaps.map((g) => `${g.kind}:${g.field}`),
    ["confirm:quantity", "clarify:weightKg", "clarify:condition", "confirm:pickupWindow"],
  )
  const c = receiveOffer(demoOffer(), t("17:00"))
  assert.equal(c.state, "needs_information")
  assert.equal(c.events[0].type, "offer_received")
})

test("requests are created by the v0.10 Human Interaction Layer, one per gap, without duplicates", () => {
  let c = receiveOffer(demoOffer(), t("17:00"))
  c = requestInformation(c, t("17:01"), 30)
  assert.equal(c.interactions.length, 4)
  for (const i of c.interactions) {
    assert.equal(i.status, "pending")
    assert.equal(i.targetActorId, donor.id)
    assert.equal(i.entityId, "offer-001")
    assert.equal(i.reasonCode, `${i.kind}:${i.field}`)
    assert.equal(i.events[0].type, "interaction_created")
  }
  assert.equal(c.interactions[0].expiresAt, t("17:31"))
  c = requestInformation(c, t("17:02"))
  assert.equal(c.interactions.length, 4)
})

test("destinations cannot be proposed while information is missing", () => {
  const c = requestInformation(receiveOffer(demoOffer(), t("17:00")), t("17:01"))
  expectFlowError(() => proposeDestinations(c, D, V, t("17:02")), "missing_information")
})

test("answers confirm fields with traceable before/after values", () => {
  const c = readyCase()
  assert.equal(c.state, "ready_to_match")
  assert.equal(c.offer.weightKg.value, 60)
  assert.equal(c.offer.condition.value, "edible")
  assert.equal(c.offer.quantity.status, "confirmed")
  assert.match(c.offer.quantity.source ?? "", /^interaction:/)
  const answered = c.interactions.find((i) => i.field === "weightKg")!
  assert.equal(answered.status, "answered")
  assert.equal(answered.response?.text, "60")
  assert.equal(answered.response?.actorId, donor.id)
  const confirmed = c.events.filter((e) => e.type === "field_confirmed")
  assert.equal(confirmed.length, 4)
  const qty = confirmed.find((e) => e.detail.field === "quantity")!
  assert.deepEqual(qty.detail.before, { value: 40, status: "reported" })
  assert.deepEqual(qty.detail.after, { value: 40, status: "confirmed" })
})

test("rejecting a confirmation clears the value and asks again", () => {
  let c = requestInformation(receiveOffer(demoOffer(), t("17:00")), t("17:01"))
  const q = c.interactions.find((i) => i.field === "quantity")!
  c = answerInteraction(c, q.id, donor, { responseId: "reject" }, t("17:02"))
  assert.equal(c.offer.quantity.status, "missing")
  assert.equal(c.offer.quantity.value, null)
  assert.ok(c.events.some((e) => e.type === "field_rejected"))
  c = requestInformation(c, t("17:03"))
  const reopened = c.interactions.filter((i) => i.field === "quantity" && i.status === "pending")
  assert.equal(reopened.length, 1)
  assert.equal(reopened[0].kind, "clarify")
})

test("only the addressed person can answer, and only with an allowed response", () => {
  const c = requestInformation(receiveOffer(demoOffer(), t("17:00")), t("17:01"))
  const cond = c.interactions.find((i) => i.field === "condition")!
  expectFlowError(() => answerInteraction(c, cond.id, driver, { responseId: "edible" }, t("17:02")), "wrong_actor")
  expectFlowError(() => answerInteraction(c, cond.id, { ...donor, role: "driver" }, { responseId: "edible" }, t("17:02")), "unauthorized_role")
  expectFlowError(() => answerInteraction(c, cond.id, donor, { responseId: "excelente" }, t("17:02")), "invalid_response")
  const w = c.interactions.find((i) => i.field === "weightKg")!
  expectFlowError(() => answerInteraction(c, w.id, donor, { responseId: "provide_value", text: "mucho" }, t("17:02")), "invalid_answer")
  // An unreadable value leaves the request open.
  assert.equal(c.interactions.find((i) => i.id === w.id)!.status, "pending")
})

test("silence is not consent: expired requests leave data unconfirmed", () => {
  let c = requestInformation(receiveOffer(demoOffer(), t("17:00")), t("17:00"), 30)
  c = expireInteractions(c, t("17:45"))
  assert.ok(c.interactions.every((i) => i.status === "expired"))
  assert.ok(c.events.some((e) => e.type === "interaction_expired"))
  assert.equal(c.offer.quantity.status, "reported")
  assert.equal(c.state, "needs_information")
  expectFlowError(() => answerInteraction(c, c.interactions[0].id, donor, { responseId: "confirm" }, t("17:46")), "not_pending")
  const late = requestInformation(receiveOffer(demoOffer(), t("17:00")), t("17:00"), 30)
  expectFlowError(() => answerInteraction(late, late.interactions[0].id, donor, { responseId: "confirm" }, t("17:31")), "interaction_expired")
})

test("cancelled requests are recorded with their reason", () => {
  let c = requestInformation(receiveOffer(demoOffer(), t("17:00")), t("17:01"))
  c = cancelInteraction(c, c.interactions[0].id, operator, "El donante llamó por teléfono", t("17:02"))
  assert.equal(c.interactions[0].status, "cancelled")
  assert.equal(c.events.at(-1)!.detail.reason, "El donante llamó por teléfono")
})

test("no option is viable until a person verifies the route", () => {
  const c = proposeDestinations(readyCase(), D, V, t("17:10"))
  assert.equal(c.state, "needs_route_review")
  assert.ok(c.proposals.every((p) => !p.feasible && p.score === null))
  const pending = c.proposals.filter(onlyNeedsRouteReview)
  assert.deepEqual(
    pending.map((p) => `${p.destinationId}:${p.vehicleId}`),
    ["dest-comedor-doctores:veh-van-luis", "dest-compostaje-iztapalapa:veh-van-luis"],
  )
  expectFlowError(() => reviewRoute(c, donor, pending[0].id, D, V, t("17:11")), "not_authorized")
  const blocked = c.proposals.find((p) => !onlyNeedsRouteReview(p))!
  expectFlowError(() => reviewRoute(c, operator, blocked.id, D, V, t("17:11")), "route_review_not_applicable")
  expectFlowError(() => recordDecision(c, operator, { outcome: "approved", proposalId: pending[0].id }, t("17:11")), "nothing_to_approve")
})

test("matching applies the v0.10 hard gates before scoring", () => {
  const c = proposedCase()
  assert.equal(c.state, "proposed")
  assert.equal(c.proposals.length, 9)
  const top = c.proposals[0]
  assert.ok(top.feasible)
  assert.equal(top.destinationId, "dest-comedor-doctores")
  assert.equal(top.vehicleId, "veh-van-luis")
  assert.equal(top.scoreVersion, "grinflow-match-v1")
  assert.ok(top.score !== null && top.score > 0 && top.score <= 1)
  assert.ok(top.routeReviewed)
  assert.equal(c.routeReviews[0].reviewedBy, operator.id)
  assert.equal(c.events.at(-1)!.type, "route_reviewed")

  const byPair = (d: string, v: string) => c.proposals.find((p) => p.destinationId === d && p.vehicleId === v)!
  const codes = (d: string, v: string) => byPair(d, v).blocks.map((b) => b.code)
  assert.ok(codes("dest-albergue-norte", "veh-van-luis").includes("recipient_capacity"))
  assert.ok(codes("dest-comedor-doctores", "veh-moto-carga").includes("transport_capacity"))
  assert.ok(codes("dest-comedor-doctores", "veh-camioneta-banco").includes("transport_unconfirmed"))
  for (const p of c.proposals.filter((p) => !p.feasible)) assert.equal(p.score, null)
  // The compost option was not reviewed, so it stays blocked on its route.
  assert.ok(onlyNeedsRouteReview(byPair("dest-compostaje-iztapalapa", "veh-van-luis")))
})

test("food of unknown condition never goes to people", () => {
  const offer = readyCase().offer
  offer.condition = { value: "unknown", status: "confirmed", source: "test" }
  const people = evaluate(offer, { ...D[0], acceptsConditions: ["edible", "unknown"] }, V[0], null, t("17:10"))
  assert.ok(people.blocks.some((b) => b.code === "human_safety_gate"))
  const compost = evaluate(offer, D[2], V[0], null, t("17:10"))
  assert.ok(onlyNeedsRouteReview(compost))
})

test("a late pickup window blocks destinations that close first", () => {
  const offer = readyCase().offer
  const p = evaluate(offer, { ...D[0], capacityKg: 500, receivingWindow: { start: t("08:00"), end: t("18:35") } }, V[0], null, t("17:10"))
  assert.ok(p.blocks.some((b) => b.code === "no_delivery_slot"))
})

test("only an operator can decide, and approval requires a feasible proposal", () => {
  const c = proposedCase()
  const blocked = c.proposals.find((p) => !p.feasible)!
  expectFlowError(() => recordDecision(c, donor, { outcome: "approved", proposalId: c.proposals[0].id }, t("17:12")), "not_authorized")
  expectFlowError(() => recordDecision(c, operator, { outcome: "approved", proposalId: blocked.id }, t("17:12")), "proposal_blocked")
  expectFlowError(() => recordDecision(c, operator, { outcome: "approved", proposalId: "nope" }, t("17:12")), "proposal_not_found")
  expectFlowError(() => recordDecision(c, operator, { outcome: "rejected", reason: "  " }, t("17:12")), "reason_required")
})

test("a human decision is logged with who, when and which option, and closes the case", () => {
  let c = proposedCase()
  c = recordDecision(c, operator, { outcome: "approved", proposalId: c.proposals[0].id }, t("17:12"))
  assert.equal(c.state, "approved")
  assert.deepEqual(c.decision, {
    outcome: "approved",
    proposalId: c.proposals[0].id,
    decidedBy: operator.id,
    decidedAt: t("17:12"),
    reason: null,
  })
  const last = c.events.at(-1)!
  assert.equal(last.type, "decision_recorded")
  assert.equal(last.actorId, operator.id)
  assert.deepEqual(c.events.map((e) => e.seq), c.events.map((_, i) => i + 1))
  expectFlowError(() => recordDecision(c, operator, { outcome: "rejected", reason: "cambio" }, t("17:13")), "case_closed")
})

test("no feasible option is reported instead of forcing a proposal", () => {
  const c = proposeDestinations(readyCase(), [D[1]], [V[1]], t("17:10"))
  assert.equal(c.state, "no_feasible_option")
  expectFlowError(() => recordDecision(c, operator, { outcome: "approved", proposalId: c.proposals[0].id }, t("17:12")), "nothing_to_approve")
})

test("the scripted demo runs end to end and stops where a human is needed", async () => {
  const { runDemoFlow } = await import("../lib/grinflow/run-demo.ts")
  assert.equal(runDemoFlow().stoppedAt, "awaiting_decision")
  assert.equal(runDemoFlow({ reviewRouteIndex: null }).stoppedAt, "needs_route_review")
  const decided = runDemoFlow({ decision: { outcome: "approved" } })
  assert.equal(decided.stoppedAt, "decided")
  assert.equal(decided.case.decision?.decidedBy, operator.id)
  const silent = runDemoFlow({ answers: { quantity: "confirm" } })
  assert.equal(silent.stoppedAt, "needs_information")
  const rejected = runDemoFlow({ decision: { outcome: "rejected" } })
  assert.equal(rejected.error?.code, "reason_required")
})
