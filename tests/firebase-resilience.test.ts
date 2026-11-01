import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePrivateKey } from "../lib/firebase/admin.ts";
import { createMemoryStore, withFallback, type RegistryStore } from "../lib/registry/store.ts";

const PEM = "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n";

test("private key is accepted however it was pasted", () => {
  assert.equal(normalizePrivateKey("-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n"), PEM);
  assert.equal(normalizePrivateKey(`"-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n"`), PEM);
  assert.equal(normalizePrivateKey("-----BEGIN PRIVATE KEY-----\r\nABC\r\n-----END PRIVATE KEY-----"), PEM);
  assert.equal(normalizePrivateKey(JSON.stringify({ private_key: PEM, client_email: "x" })), PEM);
  assert.equal(normalizePrivateKey("  "), undefined);
});

test("a failing Firestore answers from memory and reports the error", async () => {
  const boom = async () => { throw new Error("PERMISSION_DENIED"); };
  const broken = { kind: "firestore", getConversation: boom, saveConversation: boom, getRegistration: boom, findRegistrationByPhone: boom, saveRegistration: boom, listRegistrations: boom, addInbox: boom, listInbox: boom } as unknown as RegistryStore;
  const store = withFallback(broken, createMemoryStore());
  assert.deepEqual(await store.listRegistrations(), []);
  assert.match(store.lastError ?? "", /PERMISSION_DENIED/);
  await store.addInbox({ id: "i1", at: new Date(0).toISOString() } as never);
  assert.equal((await store.listInbox()).length, 1);
});

test("a hanging Firestore times out instead of hanging the request", async () => {
  const hang = () => new Promise<never>(() => {});
  const stuck = { kind: "firestore", listRegistrations: hang } as unknown as RegistryStore;
  const store = withFallback(stuck, createMemoryStore(), 50);
  assert.deepEqual(await store.listRegistrations(), []);
  assert.match(store.lastError ?? "", /no answer/);
});
