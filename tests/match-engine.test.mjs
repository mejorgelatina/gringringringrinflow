import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMatch, rankMatches } from "../lib/engines/match-engine.mjs";

const now = Date.parse("2026-10-28T12:00:00Z");
const offer = { id: "offer-1", category: "panificados", quantity: 10, unit: "caja", quantityBasis: "confirmed", quantityConfirmed: true, condition: "edible", conditionConfirmed: true, deadline: "2026-10-28T18:00:00Z" };
const recipient = { id: "recipient-1", name: "Destino A", categories: ["panificados"], conditionPolicy: ["edible"], confirmed: true, capacity: 20, unit: "caja", intendedUse: "human_consumption", availableUntil: "2026-10-28T19:00:00Z" };
const transport = { id: "transport-1", name: "Unidad A", confirmed: true, status: "available", capacity: 15, unit: "caja", availableUntil: "2026-10-28T19:00:00Z" };
const route = { verified: true, provider: "human-reviewed-test-route", distanceKm: 3.2, durationMinutes: 18, estimatedArrivalAt: Date.parse("2026-10-28T13:00:00Z"), verifiedAt: "2026-10-28T11:00:00Z" };

test("eligible candidate requires a verified route and all hard gates", () => {
  const result = evaluateMatch({ offer, recipient, transport, route, now });
  assert.equal(result.eligible, true);
  assert.equal(result.scoreVersion, "grinflow-match-v1");
  assert.ok(result.score > 0);
});
test("route absence prevents operational eligibility and does not invent distance", () => {
  const result = evaluateMatch({ offer, recipient, transport, now });
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.some(b => b.code === "route_unverified"));
  assert.equal(result.route, null);
});
test("human consumption requires independently confirmed edible condition", () => {
  const result = evaluateMatch({ offer: { ...offer, conditionConfirmed: false }, recipient, transport, route, now });
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.some(b => b.code === "human_safety_gate"));
});
test("estimated quantities cannot be ranked as eligible", () => {
  const result = evaluateMatch({ offer: { ...offer, quantityBasis: "estimated", quantityConfirmed: false }, recipient, transport, route, now });
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.some(b => b.code === "quantity_unconfirmed"));
});
test("unit mismatch blocks a candidate instead of guessing a conversion", () => {
  const result = evaluateMatch({ offer, recipient, transport: { ...transport, unit: "kg" }, route, now });
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.some(b => b.code === "unit_mismatch"));
});
test("expired offer is blocked", () => {
  const result = evaluateMatch({ offer: { ...offer, deadline: "2026-10-28T10:00:00Z" }, recipient, transport, route, now });
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.some(b => b.code === "deadline_passed"));
});
test("ranking places eligible candidates before blocked candidates", () => {
  const results = rankMatches({ offer, recipients: [recipient, { ...recipient, id: "recipient-2", confirmed: false }], transports: [transport], routesByPair: { "recipient-1:transport-1": route, "recipient-2:transport-1": route }, now });
  assert.equal(results[0].eligible, true);
  assert.equal(results[1].eligible, false);
});
test("scores never override a hard blocker", () => {
  const result = evaluateMatch({ offer, recipient: { ...recipient, capacity: 1 }, transport, route, now });
  assert.equal(result.eligible, false);
  assert.equal(result.score, null);
});
