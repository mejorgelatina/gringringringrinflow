import assert from "node:assert/strict"
import { test } from "node:test"

import { ALL_CONFIRMED, DEMO_CANDIDATES, NONE_CONFIRMED, evaluateDemo, type CandidateToggles } from "../lib/backhaul/demo.ts"

const all = (t: CandidateToggles) => Object.fromEntries(DEMO_CANDIDATES.map(c => [c.id, { ...t }]))
const trip = { vehicleConfirmed: true, originalDeliveryConfirmed: true, transportPermissionConfirmed: true }
const byId = (r: ReturnType<typeof evaluateDemo>, id: string) => r.find(x => x.offerId === id)!

test("nothing is feasible until people confirm consent, quantity, condition and route", () => {
  const r = evaluateDemo(trip, all(NONE_CONFIRMED))
  assert.ok(r.every(x => !x.feasible))
  assert.ok(byId(r, "jamaica-tomatoes").blockers.some(b => b.code === "route_unverified"))
})

test("with everything confirmed, the on-the-way compost run ranks first and the rest explain why not", () => {
  const r = evaluateDemo(trip, all(ALL_CONFIRMED))
  assert.equal(r[0].offerId, "jamaica-tomatoes")
  assert.equal(r[0].feasible, true)
  assert.equal(r[0].netKmBenefit, 7.3)
  assert.ok(byId(r, "central-fruit").blockers.some(b => b.code === "vehicle_capacity"))
  assert.ok(byId(r, "roma-lettuce").blockers.some(b => b.code === "no_net_route_benefit"))
  assert.equal(byId(r, "espiga-bread").feasible, true)
})

test("bread for people stays blocked until a person confirms its condition", () => {
  const t = all(ALL_CONFIRMED)
  t["espiga-bread"].conditionConfirmed = false
  assert.ok(byId(evaluateDemo(trip, t), "espiga-bread").blockers.some(b => b.code === "food_safety"))
})

test("unconfirmed carrier terms block every opportunity", () => {
  const r = evaluateDemo({ ...trip, transportPermissionConfirmed: false }, all(ALL_CONFIRMED))
  assert.ok(r.every(x => x.blockers.some(b => b.code === "transport_terms_unconfirmed")))
})
