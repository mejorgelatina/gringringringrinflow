import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldCallMeta } from '../lib/meta/meta-config.mjs';

test('Meta inference stays disabled when the flag is absent, even with a key', () => {
  assert.equal(shouldCallMeta({ apiKey: 'configured-secret', callsEnabled: undefined }), false);
});

test('Meta inference stays disabled when the key is absent, even if the flag is true', () => {
  assert.equal(shouldCallMeta({ apiKey: undefined, callsEnabled: 'true' }), false);
});

test('Meta inference is enabled only when key and explicit true flag both exist', () => {
  assert.equal(shouldCallMeta({ apiKey: 'configured-secret', callsEnabled: 'true' }), true);
  assert.equal(shouldCallMeta({ apiKey: 'configured-secret', callsEnabled: 'false' }), false);
  assert.equal(shouldCallMeta({ apiKey: 'configured-secret', callsEnabled: 'TRUE' }), false);
});
