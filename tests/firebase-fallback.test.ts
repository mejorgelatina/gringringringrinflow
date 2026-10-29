import { test } from "node:test";
import assert from "node:assert/strict";
import { firebaseEnabled, firestore } from "../lib/firebase/admin.ts";
import { claimWebhookMessage, persistWhatsAppTurn } from "../lib/firebase/whatsapp-store.ts";
import { lookup, remember } from "../lib/agent/registry.ts";

for (const k of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]) delete process.env[k];

test("without Firebase variables nothing connects and the demo keeps working", async () => {
  assert.equal(firebaseEnabled(), false);
  assert.equal(firestore(), null);
  assert.equal(await claimWebhookMessage("wamid.1"), "unavailable");
  const persisted = await persistWhatsAppTurn(
    { id: "wamid.1", from: "5215500000000", timestamp: "0", type: "text", text: "hola", mediaId: null },
    { id: "wamid.1", source: "webhook", from: "••••0000", receivedAt: new Date(0).toISOString(), steps: [], reply: null, replyStatus: "none", metaCalls: 0, intake: null } as never
  );
  assert.equal(persisted, false);
});

test("tracking numbers fall back to this instance's memory", async () => {
  await remember("GF-1A2B3C4D", "sealed.token");
  assert.equal(await lookup(" gf-1a2b3c4d "), "sealed.token");
  assert.equal(await lookup("GF-FFFFFFFF"), null);
});
