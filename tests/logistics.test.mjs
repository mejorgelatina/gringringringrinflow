import test from "node:test";
import assert from "node:assert/strict";
import { SEED_STATE, assessOperation, transitionOperation, updateOperation } from "../lib/engines/logistics.mjs";

test("seed data is explicitly synthetic and contains operational lifecycle examples", () => {
  assert.ok(SEED_STATE.operations.length >= 3);
  assert.ok(SEED_STATE.audit[0].detail.includes("Synthetic"));
});
test("unknown food condition blocks people-tier destination", () => {
  const op = { category:"panificados", quantity:5, quantityConfirmed:true, condition:"unknown", conditionConfirmed:false, pickupLocation:"Roma", deadline:"2026-10-28T18:00:00-06:00" };
  const recipient = SEED_STATE.recipients[0]; const vehicle = SEED_STATE.vehicles[0];
  const result = assessOperation(op,recipient,vehicle);
  assert.equal(result.feasible,false);
  assert.ok(result.blockers.some(x=>x.includes("Condition")));
});
test("estimated or unconfirmed quantity cannot advance to matching", () => {
  const state = structuredClone(SEED_STATE);
  const op = state.operations.find(x=>x.id==="GF-1025");
  const result = transitionOperation(state,op.id,"ready_to_match");
  assert.equal(result.ok,false);
  assert.ok(result.error.includes("quantity confirmation"));
});
test("cannot approve a proposal without a confirmed feasible destination and vehicle", () => {
  const state = structuredClone(SEED_STATE);
  const op = state.operations.find(x=>x.id==="GF-1025");
  op.status = "proposed";
  const result = transitionOperation(state,op.id,"approved");
  assert.equal(result.ok,false);
  assert.ok(result.error.includes("Cannot proceed"));
});
test("valid synthetic operation may be approved, and action is audited", () => {
  const state = structuredClone(SEED_STATE);
  state.operations.find(x=>x.id==="GF-1024").conditionConfirmed = true;
  const result = transitionOperation(state,"GF-1024","approved");
  assert.equal(result.ok,true);
  assert.equal(result.state.operations.find(x=>x.id==="GF-1024").status,"approved");
  assert.equal(result.state.audit[0].action,"status_changed");
});
test("illegal lifecycle transition is rejected", () => {
  const result = transitionOperation(structuredClone(SEED_STATE),"GF-1024","delivered");
  assert.equal(result.ok,false);
  assert.ok(result.error.includes("Transition not allowed"));
});
test("correction is rejected for terminal/committed records", () => {
  const state = structuredClone(SEED_STATE);
  state.operations[0].status="approved";
  const result = updateOperation(state,"GF-1024",{quantity:21});
  assert.equal(result.ok,false);
});
test("correction appends before/after values to audit history", () => {
  const state = structuredClone(SEED_STATE);
  const result = updateOperation(state,"GF-1025",{quantity:11,quantityConfirmed:true});
  assert.equal(result.ok,true);
  assert.ok(result.state.audit[0].detail.includes('"before"'));
  assert.ok(result.state.audit[0].detail.includes('"after"'));
});
