import test from "node:test";
import assert from "node:assert/strict";
import { evaluateBackhaul, rankBackhaulOpportunities } from "../lib/engines/backhaul.mjs";

const now = Date.parse("2026-10-28T12:00:00Z");
const input = {
  trip: { vehicleConfirmed: true, originalDeliveryConfirmed: true, capacity: 20, loadAfterDropoff: 2, availableUntil: "2026-10-28T16:00:00Z", transportPermissionConfirmed: true },
  offer: { id: "offer-b", category: "frutas", quantity: 8, quantityConfirmed: true, condition: "edible", conditionConfirmed: true, deadline: "2026-10-28T15:00:00Z", donorConfirmed: true, shareConsent: true },
  recipient: { id: "recipient-b", categories: ["frutas"], conditionPolicy: ["edible"], intendedUse: "human_consumption", confirmed: true },
  route: { verified: true, provider: "test-route-provider", pickupEta: "2026-10-28T13:00:00Z", deliveryEta: "2026-10-28T14:00:00Z", incrementalKm: 3, emptyKmAvoided: 12, incrementalMinutes: 20, verifiedAt: "2026-10-28T11:00:00Z" },
  now
};

test("finds a feasible backhaul when consent, capacity, safety and route pass", () => {
  const result = evaluateBackhaul(input);
  assert.equal(result.feasible, true);
  assert.equal(result.netKmBenefit, 9);
  assert.equal(result.scoreVersion, "grinflow-backhaul-v1");
  assert.ok(result.warnings.some(w => w.code === "human_dispatch_required"));
});
test("blocks opportunity without explicit donor sharing consent", () => {
  const result = evaluateBackhaul({ ...input, offer: { ...input.offer, shareConsent: false } });
  assert.equal(result.feasible, false);
  assert.ok(result.blockers.some(b => b.code === "donor_consent"));
});
test("blocks if remaining capacity is insufficient", () => {
  const result = evaluateBackhaul({ ...input, trip: { ...input.trip, loadAfterDropoff: 15 } });
  assert.equal(result.feasible, false);
  assert.ok(result.blockers.some(b => b.code === "vehicle_capacity"));
});
test("blocks if food condition is not independently confirmed for human consumption", () => {
  const result = evaluateBackhaul({ ...input, offer: { ...input.offer, conditionConfirmed: false } });
  assert.equal(result.feasible, false);
  assert.ok(result.blockers.some(b => b.code === "food_safety"));
});
test("blocks route claims without verified route metrics", () => {
  const result = evaluateBackhaul({ ...input, route: { ...input.route, verified: false } });
  assert.equal(result.feasible, false);
  assert.ok(result.blockers.some(b => b.code === "route_unverified"));
});
test("blocks detours that exceed empty kilometers avoided", () => {
  const result = evaluateBackhaul({ ...input, route: { ...input.route, incrementalKm: 15 } });
  assert.equal(result.feasible, false);
  assert.ok(result.blockers.some(b => b.code === "no_net_route_benefit"));
});
test("blocks if carrier/platform permission has not been confirmed", () => {
  const result = evaluateBackhaul({ ...input, trip: { ...input.trip, transportPermissionConfirmed: false } });
  assert.equal(result.feasible, false);
  assert.ok(result.blockers.some(b => b.code === "transport_terms_unconfirmed"));
});
test("ranking sorts feasible backhaul ahead of blocked opportunity", () => {
  const results = rankBackhaulOpportunities(input, [
    { offer: input.offer, recipient: input.recipient, route: input.route },
    { offer: { ...input.offer, id: "unsafe", condition: "unknown", conditionConfirmed: false }, recipient: input.recipient, route: input.route }
  ]);
  assert.equal(results[0].feasible, true);
  assert.equal(results[1].feasible, false);
});
