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
} from "../lib/grinflow/flow.ts"
import { identifyGaps } from "../lib/grinflow/gaps.ts"
import { evaluate } from "../lib/grinflow/match.ts"
import type { OfferCase } from "../lib/grinflow/types.ts"

const t = (hhmm: string) => `${DEMO_DAY}T${hhmm}:00.000Z`
const { donor, operator, driver } = DEMO_ACTORS

function answerAll(c: OfferCase, answers: Record<string, string>, now: string): OfferCase {
  let next = c
  for (const i of c.interactions.filter((x) => x.state === "open")) {
    next = answerInteraction(next, i.id, donor, answers[i.field], now)
  }
  return next
}

function readyCase(): OfferCase {
  let c = receiveOffer(demoOffer(), t("17:00"))
  c = requestInformation(c, t("17:01"))
  return answerAll(c, { quantity: "si", weightKg: "60", condition: "good", pickupWindow: "si" }, t("17:05"))
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

test("requesting information opens one interaction per gap and does not duplicate them", () => {
  let c = receiveOffer(demoOffer(), t("17:00"))
  c = requestInformation(c, t("17:01"), 30)
  assert.equal(c.interactions.length, 4)
  assert.ok(c.interactions.every((i) => i.targetActorId === donor.id && i.state === "open"))
  assert.equal(c.interactions[0].expiresAt, t("17:31"))
  c = requestInformation(c, t("17:02"))
  assert.equal(c.interactions.length, 4)
})

test("destinations cannot be proposed while information is missing", () => {
  const c = requestInformation(receiveOffer(demoOffer(), t("17:00")), t("17:01"))
  expectFlowError(() => proposeDestinations(c, DEMO_DESTINATIONS, DEMO_VEHICLES, t("17:02")), "missing_information")
})

test("answers confirm fields with traceable before/after values", () => {
  const c = readyCase()
  assert.equal(c.state, "ready_to_match")
  assert.equal(c.offer.weightKg.value, 60)
  assert.equal(c.offer.quantity.status, "confirmed")
  assert.match(c.offer.quantity.source ?? "", /^interaction:/)
  const confirmed = c.events.filter((e) => e.type === "field_confirmed")
  assert.equal(confirmed.length, 4)
  const qty = confirmed.find((e) => e.detail.field === "quantity")!
  assert.deepEqual(qty.detail.before, { value: 40, status: "reported" })
  assert.deepEqual(qty.detail.after, { value: 40, status: "confirmed" })
})

test("a 'no' to a confirmation clears the value and asks again", () => {
  let c = requestInformation(receiveOffer(demoOffer(), t("17:00")), t("17:01"))
  const q = c.interactions.find((i) => i.field === "quantity")!
  c = answerInteraction(c, q.id, donor, "No", t("17:02"))
  assert.equal(c.offer.quantity.status, "missing")
  assert.equal(c.offer.quantity.value, null)
  assert.ok(c.events.some((e) => e.type === "field_rejected"))
  c = requestInformation(c, t("17:03"))
  const reopened = c.interactions.filter((i) => i.field === "quantity" && i.state === "open")
  assert.equal(reopened.length, 1)
  assert.equal(reopened[0].kind, "clarify")
})

test("only the addressed person can answer, and only with an allowed answer", () => {
  const c = requestInformation(receiveOffer(demoOffer(), t("17:00")), t("17:01"))
  const cond = c.interactions.find((i) => i.field === "condition")!
  expectFlowError(() => answerInteraction(c, cond.id, driver, "good", t("17:02")), "wrong_role")
  expectFlowError(() => answerInteraction(c, cond.id, { ...donor, id: "someone-else" }, "good", t("17:02")), "wrong_actor")
  expectFlowError(() => answerInteraction(c, cond.id, donor, "excelente", t("17:02")), "answer_not_allowed")
  const w = c.interactions.find((i) => i.field === "weightKg")!
  expectFlowError(() => answerInteraction(c, w.id, donor, "mucho", t("17:02")), "invalid_answer")
})

test("silence is not consent: expired requests leave data unconfirmed", () => {
  let c = requestInformation(receiveOffer(demoOffer(), t("17:00")), t("17:00"), 30)
  c = expireInteractions(c, t("17:45"))
  assert.ok(c.interactions.every((i) => i.state === "expired"))
  assert.equal(c.offer.quantity.status, "reported")
  assert.equal(c.state, "needs_information")
  expectFlowError(() => answerInteraction(c, c.interactions[0].id, donor, "si", t("17:46")), "interaction_closed")
  const late = requestInformation(receiveOffer(demoOffer(), t("17:00")), t("17:00"), 30)
  expectFlowError(() => answerInteraction(late, late.interactions[0].id, donor, "si", t("17:31")), "interaction_expired")
})

test("cancelled requests are recorded with their reason", () => {
  let c = requestInformation(receiveOffer(demoOffer(), t("17:00")), t("17:01"))
  c = cancelInteraction(c, c.interactions[0].id, operator, "El donante llamó por teléfono", t("17:02"))
  assert.equal(c.interactions[0].state, "cancelled")
  assert.equal(c.events.at(-1)!.detail.reason, "El donante llamó por teléfono")
})

test("matching applies hard constraints before scoring", () => {
  const c = proposeDestinations(readyCase(), DEMO_DESTINATIONS, DEMO_VEHICLES, t("17:10"))
  assert.equal(c.state, "proposed")
  assert.equal(c.proposals.length, 9)
  const top = c.proposals[0]
  assert.ok(top.feasible)
  assert.equal(top.destinationId, "dest-comedor-doctores")
  assert.equal(top.vehicleId, "veh-van-luis")

  const byId = (d: string, v: string) => c.proposals.find((p) => p.destinationId === d && p.vehicleId === v)!
  const codes = (d: string, v: string) => byId(d, v).blocks.map((b) => b.code)
  assert.ok(codes("dest-albergue-norte", "veh-van-luis").includes("destination_capacity"))
  assert.ok(codes("dest-comedor-doctores", "veh-moto-carga").includes("vehicle_capacity"))
  assert.ok(codes("dest-comedor-doctores", "veh-camioneta-banco").includes("vehicle_unconfirmed"))
  for (const p of c.proposals.filter((p) => !p.feasible)) assert.equal(p.score, null)
  // Human consumption ranks above valorization when both are feasible.
  const compost = byId("dest-compostaje-iztapalapa", "veh-van-luis")
  assert.ok(compost.feasible && (compost.score ?? 0) < (top.score ?? 0))
})

test("food of unknown condition never goes to people", () => {
  const offer = demoOffer()
  const confirmed = { status: "confirmed" as const, source: "test" }
  offer.quantity = { ...offer.quantity, ...confirmed }
  offer.weightKg = { value: 60, ...confirmed }
  offer.pickupWindow = { ...offer.pickupWindow, ...confirmed }
  offer.condition = { value: "unknown", ...confirmed }
  const people = evaluate(offer, { ...DEMO_DESTINATIONS[0], acceptsConditions: ["good", "unknown"] }, DEMO_VEHICLES[0])
  assert.equal(people.feasible, false)
  assert.ok(people.blocks.some((b) => b.code === "unsafe_for_people"))
  assert.ok(evaluate(offer, DEMO_DESTINATIONS[2], DEMO_VEHICLES[0]).feasible)
})

test("a late pickup window blocks destinations that close first", () => {
  const offer = readyCase().offer
  const p = evaluate(offer, { ...DEMO_DESTINATIONS[0], capacityKg: 500, receivingWindow: { start: t("08:00"), end: t("18:35") } }, DEMO_VEHICLES[0])
  assert.ok(p.blocks.some((b) => b.code === "no_delivery_slot"))
})

test("only an operator can decide, and approval requires a feasible proposal", () => {
  const c = proposeDestinations(readyCase(), DEMO_DESTINATIONS, DEMO_VEHICLES, t("17:10"))
  const blocked = c.proposals.find((p) => !p.feasible)!
  expectFlowError(() => recordDecision(c, donor, { outcome: "approved", proposalId: c.proposals[0].id }, t("17:12")), "not_authorized")
  expectFlowError(() => recordDecision(c, operator, { outcome: "approved", proposalId: blocked.id }, t("17:12")), "proposal_blocked")
  expectFlowError(() => recordDecision(c, operator, { outcome: "approved", proposalId: "nope" }, t("17:12")), "proposal_not_found")
  expectFlowError(() => recordDecision(c, operator, { outcome: "rejected", reason: "  " }, t("17:12")), "reason_required")
})

test("a human decision is logged with who, when and which option, and closes the case", () => {
  let c = proposeDestinations(readyCase(), DEMO_DESTINATIONS, DEMO_VEHICLES, t("17:10"))
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
  const c = proposeDestinations(readyCase(), [DEMO_DESTINATIONS[1]], [DEMO_VEHICLES[1]], t("17:10"))
  assert.equal(c.state, "no_feasible_option")
  expectFlowError(() => recordDecision(c, operator, { outcome: "approved", proposalId: c.proposals[0].id }, t("17:12")), "nothing_to_approve")
})

test("the scripted demo runs end to end and stops where a human is needed", async () => {
  const { runDemoFlow } = await import("../lib/grinflow/run-demo.ts")
  assert.equal(runDemoFlow().stoppedAt, "awaiting_decision")
  const decided = runDemoFlow({ decision: { outcome: "approved" } })
  assert.equal(decided.stoppedAt, "decided")
  assert.equal(decided.case.decision?.decidedBy, operator.id)
  const silent = runDemoFlow({ answers: { quantity: "si" } })
  assert.equal(silent.stoppedAt, "needs_information")
  const rejected = runDemoFlow({ decision: { outcome: "rejected" } })
  assert.equal(rejected.error?.code, "reason_required")
})
