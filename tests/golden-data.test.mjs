import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync(new URL('./golden-set.json', import.meta.url), 'utf8'));
test('preserved Spanish golden set has 30 unique cases', () => {
  assert.equal(data.cases.length, 30);
  assert.equal(new Set(data.cases.map(c => c.id)).size, 30);
  assert.ok(data.cases.every(c => typeof c.body === 'string' && c.expect));
});
test('golden set includes no-event and safety-critical cases', () => {
  assert.ok(data.cases.some(c => c.expect.kind === null));
  assert.ok(data.cases.some(c => c.expect.edibility === 'unknown'));
  assert.ok(data.cases.some(c => c.expect.needsReview === true));
});
