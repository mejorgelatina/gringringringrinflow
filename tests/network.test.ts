import assert from "node:assert/strict"
import { test } from "node:test"

import {
  acceptQuote,
  availableKg,
  chooseDelivery,
  confirmCapacity,
  confirmReceipt,
  NetworkError,
  notified,
  publish,
  recordPickup,
  reserve,
  stopHandoff,
  tick,
} from "../lib/network/coordinator.ts"
import { at, DEMO_NETWORK, runScenario, SCENARIO_RESOURCES, SCENARIOS } from "../lib/network/demo.ts"
import { allocateTier, matchResource } from "../lib/network/match.ts"
import { metrics } from "../lib/network/outcomes.ts"
import { coverage } from "../lib/network/coverage.ts"
import { etaMinutes, zoneFor } from "../lib/network/zones.ts"
import type { Network, Resource } from "../lib/network/types.ts"

const net = DEMO_NETWORK
const pan = () => structuredClone(SCENARIO_RESOURCES.pan)
const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return (e as NetworkError).code
  }
  return null
}
const eligible = (r: Resource, now = r.pickupWindow.start) => matchResource(r, net, r.kg, now).filter((m) => m.eligible).map((m) => m.participantId)

test("the three demo scenarios end at three different destinations, with verified kg kept separate", () => {
  const finals = SCENARIOS.map((id) => runScenario(id).steps.at(-1)!.state)
  for (const c of finals) assert.equal(c.status, "closed")
  const m = metrics(finals)
  assert.deepEqual(m.verifiedKg, { people: 30, transformation: 11.5, compost: 34 })
  assert.equal(m.delivered, 4) // pan has two deliveries, the others one each
  assert.equal(m.idleCapacityKg, 35)
  assert.ok(m.detourKm > 0 && m.detourKm <= 8)
  assert.equal(finals[0].reservations.map((r) => r.quote!.mode).join(","), "pickup,courier")
  assert.equal(finals[1].reservations[0].tier, "transformation")
  assert.equal(finals[2].reservations[0].quote!.mode, "backhaul")
})

test("food for people only when the condition is edible and confirmed; unknown never becomes edible", () => {
  for (const patch of [{ condition: "unknown" as const }, { condition: "edible" as const, conditionConfirmed: false }]) {
    const r = { ...pan(), ...patch }
    const people = matchResource(r, net, r.kg, r.pickupWindow.start).filter((m) => m.tier === "people")
    assert.ok(people.every((m) => !m.eligible && m.blocks.some((b) => b.code === "not_safe_for_people")))
  }
})

test("a maker gets the material it specified, not a generic waste category", () => {
  const shells = structuredClone(SCENARIO_RESOURCES.cascara)
  assert.deepEqual(eligible(shells).filter((id) => id.startsWith("mak-")), ["mak-cascara"]) // ceramics needs ground shell
  const rotten: Resource = { ...shells, item: "huevo entero podrido", material: undefined, attributes: [] }
  assert.ok(!eligible(rotten).includes("mak-cascara"))
  const dirty: Resource = { ...shells, attributes: ["seca"] }
  const m = matchResource(dirty, net, dirty.kg, dirty.pickupWindow.start).find((x) => x.participantId === "mak-cascara")!
  assert.ok(m.blocks.some((b) => b.code === "specs_not_met"))
})

test("maker availability and weekly capacity are filters, not suggestions", () => {
  const wednesday: Resource = { ...structuredClone(SCENARIO_RESOURCES.cascara), pickupWindow: { start: at("11:00") + 86_400_000, end: at("14:00") + 86_400_000 } }
  assert.ok(!eligible(wednesday).includes("mak-cascara"))
  const full: Network = { ...net, participants: net.participants.map((p) => (p.id === "mak-cascara" ? { ...p, need: { ...p.need!, usedThisWeekKg: 18 } } : p)) }
  const r = SCENARIO_RESOURCES.cascara
  assert.equal(matchResource(r, full, r.kg, r.pickupWindow.start).find((m) => m.participantId === "mak-cascara")!.blocks[0].code, "weekly_capacity_full")
})

test("geography is eta at that hour, not distance: zones a/b/c and rush hour", () => {
  const bakery = pan().location
  const narvarte = net.participants.find((p) => p.id === "rec-narvarte")!.location
  assert.equal(zoneFor(net.area, etaMinutes(bakery, narvarte, at("17:00"))), "b")
  assert.equal(zoneFor(net.area, etaMinutes(bakery, narvarte, at("12:00"))), "a")
  const c = publish(pan(), net, at("17:00"))
  assert.ok(!notified(c).has("rec-norte"), "zone c is not offered")
  assert.ok(!notified(c).has("rec-esperanza"), "unverified orgs are not offered")
  assert.ok(!notified(c).has("cmp-guerrero"), "compost waits while people can still take it")
})

test("partial holds never oversell, and only notified participants can reserve", () => {
  let c = publish(pan(), net, at("17:00"))
  assert.equal(code(() => reserve(c, net, "cmp-guerrero", 5, at("17:01"))), "not_notified")
  c = reserve(c, net, "rec-doctores", 20, at("17:05"))
  assert.equal(availableKg(c), 10)
  assert.equal(code(() => reserve(c, net, "rec-narvarte", 12, at("17:06"))), "over_available")
  assert.equal(code(() => reserve(c, net, "rec-narvarte", 2, at("17:06"))), "below_minimum")
  c = reserve(c, net, "rec-narvarte", 10, at("17:06"))
  assert.equal(c.status, "fully_reserved")
})

test("an unanswered hold expires, its kg come back, and leftovers cascade to the next viable tier", () => {
  let c = publish(pan(), net, at("17:00"))
  c = reserve(c, net, "rec-doctores", 20, at("17:05")) // never picks a delivery option
  c = reserve(c, net, "rec-narvarte", 6, at("17:06"))
  c = chooseDelivery(c, net, c.reservations[1].id, "courier", at("17:06"), "veh-moto")
  c = acceptQuote(c, c.reservations[1].id, "rec-narvarte", at("17:07"))
  c = confirmCapacity(c, net, c.reservations[1].id, "op-mensajeria", at("17:08"))
  c = tick(c, net, at("17:30")) // all people already notified: what is left goes on
  assert.deepEqual(c.passedTiers, ["people"]) // no maker takes bread, so transformation is skipped
  assert.equal(c.events.find((e) => e.type === "tier_passed")!.detail.to, "compost")
  assert.equal(c.activeTier, "compost")
  assert.ok(notified(c).has("cmp-guerrero"))
  c = tick(c, net, at("18:35")) // 90 min hold over
  assert.equal(c.reservations[0].status, "expired")
  assert.equal(c.reservations[1].status, "scheduled", "a confirmed operation does not expire")
  assert.equal(availableKg(c), 24)
})

test("transport is confirmed only after the receiver accepts the cost and the carrier confirms capacity", () => {
  let c = publish(pan(), net, at("17:00"))
  c = reserve(c, net, "rec-narvarte", 10, at("17:05"))
  const id = c.reservations[0].id
  assert.equal(code(() => chooseDelivery(c, net, id, "pickup", at("17:05"))), "option_unavailable") // no vehicle, zone b
  c = chooseDelivery(c, net, id, "courier", at("17:05"), "veh-moto")
  assert.equal(code(() => confirmCapacity(c, net, id, "op-mensajeria", at("17:06"))), "bad_state")
  assert.equal(code(() => acceptQuote(c, id, "don-espiga", at("17:06"))), "not_receiver")
  c = acceptQuote(c, id, "rec-narvarte", at("17:06"))
  assert.equal(code(() => confirmCapacity(c, net, id, "op-luis", at("17:07"))), "not_carrier")
  c = confirmCapacity(c, net, id, "op-mensajeria", at("17:07"))
  assert.equal(c.reservations[0].status, "scheduled")
  assert.ok(c.reservations[0].quote!.costMxn > 0 && c.reservations[0].quote!.simulated)
})

test("handoff needs the code; the donor can stop it over an anomaly and nothing counts as impact", () => {
  let c = publish(pan(), net, at("17:00"))
  c = reserve(c, net, "rec-doctores", 20, at("17:05"))
  const id = c.reservations[0].id
  c = chooseDelivery(c, net, id, "pickup", at("17:05"))
  assert.equal(code(() => recordPickup(c, id, "0000", "rec-doctores", at("17:40"))), "code_mismatch")
  assert.equal(code(() => stopHandoff(c, id, "otra persona", "rec-doctores", at("17:40"))), "not_donor")
  c = stopHandoff(c, id, "la persona no corresponde a la organización registrada", "don-espiga", at("17:41"))
  assert.equal(c.reservations[0].status, "stopped")
  assert.ok(c.events.at(-1)!.detail.escalation)
  assert.equal(availableKg(c), 30)
  assert.equal(metrics([c]).verifiedKg.people, 0)
})

test("receipt is the verified outcome and cannot exceed what was reserved", () => {
  let c = publish(pan(), net, at("17:00"))
  c = reserve(c, net, "rec-doctores", 20, at("17:05"))
  const id = c.reservations[0].id
  c = chooseDelivery(c, net, id, "pickup", at("17:05"))
  assert.equal(code(() => confirmReceipt(c, id, 20, "rec-doctores", at("17:30"))), "bad_state")
  c = recordPickup(c, id, c.reservations[0].handoffCode!, "rec-doctores", at("17:40"))
  assert.equal(code(() => confirmReceipt(c, id, 25, "rec-doctores", at("18:00"))), "bad_quantity")
  c = confirmReceipt(c, id, 19, "rec-doctores", at("18:00"))
  assert.equal(metrics([c]).verifiedKg.people, 19)
})

test("with no viable destination in any tier the lot is not offered at all", () => {
  const far: Resource = { ...pan(), location: { lat: 19.6, lng: -99.0 } }
  const m = matchResource(far, net, far.kg, far.pickupWindow.start)
  assert.equal(allocateTier(m, []), null)
  assert.equal(publish(far, net, far.pickupWindow.start).status, "no_destination")
})

test("a generator's impact zone is discovery: destinations outside it are not offered, whatever they accept", () => {
  const m = matchResource(pan(), net, 30, at("17:00")).find((x) => x.participantId === "rec-norte")!
  assert.ok(m.blocks.some((b) => b.code === "outside_impact_zone"))
})

test("a receiver can declare its own service area", () => {
  const small: Network = { ...net, participants: net.participants.map((p) => (p.id === "rec-narvarte" ? { ...p, serviceRadiusKm: 1 } : p)) }
  const m = matchResource(pan(), small, 30, at("17:00")).find((x) => x.participantId === "rec-narvarte")!
  assert.equal(m.eligible, false)
  assert.ok(m.blocks.some((b) => b.code === "outside_receiver_area"))
})

test("network coverage: share of generated kg with a viable route, per tier, with the reason for each gap", () => {
  const c = coverage(net, at("00:00"))
  assert.equal(c.totalKgPerWeek, 872)
  assert.equal(c.pct, 83)
  assert.equal(c.byTier.transformation, 20)
  const merma = c.streams.find((s) => s.stream.item === "merma de frutas y verduras")!
  assert.equal(merma.tier, null)
  assert.match(merma.reason!, /zona de impacto/)
  // returned eggs of unknown condition never reach people or the eggshell maker
  const eggs = c.streams.find((s) => s.stream.id === "devoluciones")!
  assert.equal(eggs.tier, null)
  // widening the supermarket's impact zone reaches the compost plant
  const wider: Network = { ...net, participants: net.participants.map((p) => (p.id === "don-super" ? { ...p, generator: { ...p.generator!, impactRadiusKm: 7 } } : p)) }
  assert.equal(coverage(wider, at("00:00")).streams.find((s) => s.stream.id === "merma")!.tier, "compost")
})
