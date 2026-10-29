import test from "node:test";
import assert from "node:assert/strict";
import { createInteractionRequest, respondToInteraction, expireInteraction, cancelInteraction } from "../lib/engines/interactions.mjs";

const now = Date.parse("2030-10-28T12:00:00Z");
const draft = () => createInteractionRequest({
  entityId: "offer-1", reasonCode: "quantity_missing", targetRole: "donor_contact", targetActorId: "actor-donor-1",
  channel: "web_demo", question: "¿Cuántas cajas están disponibles?", expiresAt: "2030-10-28T13:00:00Z",
  allowedResponses: [{ id: "quantity_10", label: "10 cajas", effect: "provide_information" }, { id: "not_available", label: "Ya no está disponible", effect: "withdraw_offer" }]
}, { now, id: "interaction-1" });

test("creates a pending interaction with a reason, target, choices and expiry", () => {
  const result = draft();
  assert.equal(result.ok, true);
  assert.equal(result.request.status, "pending");
  assert.equal(result.request.allowedResponses.length, 2);
});
test("rejects an already expired interaction request", () => {
  const result = createInteractionRequest({ entityId: "x", reasonCode: "missing", targetRole: "donor", question: "How many?", expiresAt: "2030-10-28T11:00:00Z", allowedResponses: [{ id: "yes" }] }, { now });
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_expiry");
});
test("requires a unique set of allowed response IDs", () => {
  const input = { entityId: "x", reasonCode: "missing", targetRole: "donor", question: "How many boxes?", expiresAt: "2030-10-28T13:00:00Z", allowedResponses: [{ id: "a" }, { id: "a" }] };
  const result = createInteractionRequest(input, { now });
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_response_ids");
});
test("authorized target role can respond, but no operational action occurs", () => {
  const request = draft().request;
  const result = respondToInteraction(request, { responseId: "quantity_10", actorId: "actor-donor-1", actorRoles: ["donor_contact"], now: now + 1000, text: "Confirmo diez cajas." });
  assert.equal(result.ok, true);
  assert.equal(result.request.status, "answered");
  assert.equal(result.operationalAction, "none");
});
test("wrong actor cannot answer a targeted request", () => {
  const result = respondToInteraction(draft().request, { responseId: "quantity_10", actorId: "other", actorRoles: ["donor_contact"], now: now + 1000 });
  assert.equal(result.ok, false);
  assert.equal(result.code, "wrong_actor");
});
test("wrong role cannot answer a request", () => {
  const result = respondToInteraction(draft().request, { responseId: "quantity_10", actorId: "actor-donor-1", actorRoles: ["viewer"], now: now + 1000 });
  assert.equal(result.ok, false);
  assert.equal(result.code, "unauthorized_role");
});
test("silence expires and is explicitly not approval", () => {
  const request = draft().request;
  const result = expireInteraction(request, { now: Date.parse("2030-10-28T13:00:00Z") });
  assert.equal(result.ok, true);
  assert.equal(result.request.status, "expired");
  assert.match(result.note, /does not mean consent/);
});
test("expired request cannot be answered retroactively", () => {
  const request = draft().request;
  const result = respondToInteraction(request, { responseId: "quantity_10", actorId: "actor-donor-1", actorRoles: ["donor_contact"], now: Date.parse("2030-10-28T13:01:00Z") });
  assert.equal(result.ok, true);
  assert.equal(result.request.status, "expired");
});
test("cancellation requires an actor and a reason", () => {
  const result = cancelInteraction(draft().request, { now: now + 1000, actor: "coordinator" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "missing_cancellation_context");
});
test("valid cancellation is audited and does not mutate operations", () => {
  const result = cancelInteraction(draft().request, { now: now + 1000, actor: "coordinator-1", reason: "Donor withdrew consent" });
  assert.equal(result.ok, true);
  assert.equal(result.request.status, "cancelled");
  assert.equal(result.operationalAction, "none");
});
