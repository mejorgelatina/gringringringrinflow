import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCandidates } from '../lib/engines/matching.mjs';

test('unknown condition never matches a people-tier recipient', () => {
  const rows = evaluateCandidates({ category: 'panificados', quantity: 10, quantityBasis: 'stated', condition: 'unknown', deadlineHour: 17 });
  assert.equal(rows.filter(x => x.feasible && x.tier === 'people').length, 0);
  assert.ok(rows.some(x => x.blockers.some(b => b.code === 'condition_not_safe_for_people')));
});
test('unconfirmed transport always blocks a candidate', () => {
  const rows = evaluateCandidates({ category: 'panificados', quantity: 10, quantityBasis: 'stated', condition: 'edible', deadlineHour: 17 });
  assert.ok(rows.filter(x => x.capacityId === 'cap-b').every(x => !x.feasible));
});
test('estimated quantity never becomes an executable match', () => {
  const rows = evaluateCandidates({ category: 'panificados', quantity: 10, quantityBasis: 'estimated', condition: 'edible', deadlineHour: 17 });
  assert.equal(rows.filter(x => x.feasible).length, 0);
  assert.ok(rows.every(x => x.blockers.some(b => b.code === 'quantity_estimated')));
});
test('missing deadline blocks every candidate', () => {
  const rows = evaluateCandidates({ category: 'panificados', quantity: 10, quantityBasis: 'stated', condition: 'edible', deadlineHour: null });
  assert.ok(rows.every(x => x.blockers.some(b => b.code === 'deadline_unknown')));
});
test('confirmed compatible scenario can produce a feasible proposal', () => {
  const rows = evaluateCandidates({ category: 'panificados', quantity: 20, quantityBasis: 'stated', condition: 'edible', deadlineHour: 17, location: 'Roma' });
  assert.ok(rows.some(x => x.feasible && x.tier === 'people'));
});

test('missing pickup location blocks every candidate', () => {
  const rows = evaluateCandidates({ category: 'panificados', quantity: 10, quantityBasis: 'stated', condition: 'edible', deadlineHour: 17 });
  assert.ok(rows.every(x => x.blockers.some(b => b.code === 'pickup_location_unknown')));
});


test('pickup in Roma can match a destination in Centro when a synthetic route exists', () => {
  const rows = evaluateCandidates({ category: 'panificados', quantity: 10, quantityBasis: 'stated', condition: 'edible', deadlineHour: 17, location: 'Roma' });
  const centro = rows.find(x => x.recipientId === 'recip-b' && x.capacityId === 'cap-a');
  assert.ok(centro);
  assert.equal(centro.routeKm, 4.8);
  assert.equal(centro.feasible, true);
});

test('unknown pickup area cannot be treated as a verified route', () => {
  const rows = evaluateCandidates({ category: 'panificados', quantity: 10, quantityBasis: 'stated', condition: 'edible', deadlineHour: 17, location: 'Coyoacán' });
  assert.ok(rows.every(x => !x.feasible));
  assert.ok(rows.every(x => x.blockers.some(b => b.code === 'route_unverified')));
});
