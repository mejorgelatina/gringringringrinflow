import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { test } from "node:test"

import type { IntakeDeps } from "../lib/intake/process.ts"
import { extractLocally } from "../lib/meta/meta.ts"
import { alreadyHandled, composeReply, handleInbound, looksEnglish } from "../lib/whatsapp/handler.ts"
import { isAllowedSender, maskPhone, parseInbound, verifySignature, verifySubscription } from "../lib/whatsapp/webhook.ts"

const JPEG = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]).toString("base64")
const payload = (messages: unknown[]) => ({ object: "whatsapp_business_account", entry: [{ id: "x", changes: [{ field: "messages", value: { messaging_product: "whatsapp", messages } }] }] })
const localDeps = (calls = { text: 0, photo: 0 }): IntakeDeps => ({
  useMeta: false, modelId: null, visionModelId: null,
  extractWithMeta: async () => { calls.text++; throw new Error("must not be called") },
  extractLocally,
  assessPhotoWithMeta: async () => { calls.photo++; throw new Error("must not be called") },
})

test("signature: only the app secret's HMAC of the raw body passes", () => {
  const body = JSON.stringify(payload([]))
  const sig = "sha256=" + createHmac("sha256", "s3cret").update(body).digest("hex")
  assert.equal(verifySignature(body, sig, "s3cret"), true)
  assert.equal(verifySignature(body + " ", sig, "s3cret"), false)
  assert.equal(verifySignature(body, sig, "other"), false)
  assert.equal(verifySignature(body, sig, undefined), false)
  assert.equal(verifySignature(body, null, "s3cret"), false)
})

test("subscription handshake echoes the challenge only for our token", () => {
  const ok = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "t", "hub.challenge": "42" })
  assert.equal(verifySubscription(ok, "t"), "42")
  assert.equal(verifySubscription(ok, "nope"), null)
  assert.equal(verifySubscription(ok, undefined), null)
})

test("parses text and image messages and ignores status callbacks", () => {
  const msgs = parseInbound(payload([
    { id: "a", from: "5215512345678", timestamp: "1", type: "text", text: { body: "hola" } },
    { id: "b", from: "5215512345678", timestamp: "2", type: "image", image: { id: "media1", caption: "pan" } },
    { id: "c", from: "5215512345678", timestamp: "3", type: "sticker" },
  ]))
  assert.deepEqual(msgs.map(m => [m.type, m.text, m.mediaId]), [["text", "hola", null], ["image", "pan", "media1"], ["other", "", null]])
  assert.deepEqual(parseInbound({ entry: [{ changes: [{ value: { statuses: [{ id: "s" }] } }] }] }), [])
  assert.deepEqual(parseInbound(null), [])
})

test("allowlist and masking", () => {
  assert.equal(isAllowedSender("5215512345678", ""), true)
  assert.equal(isAllowedSender("5215512345678", "+52 1 55 1234 5678, 5215500000000"), true)
  assert.equal(isAllowedSender("5215599999999", "5215512345678"), false)
  assert.equal(maskPhone("5215512345678"), "••••5678")
})

test("redelivered message ids are handled once", () => {
  assert.equal(alreadyHandled("wamid.1", 0), false)
  assert.equal(alreadyHandled("wamid.1", 1000), true)
  assert.equal(alreadyHandled("wamid.1", 4_000_000), false)
})

test("handler: Spanish offer gets a Spanish reply with one question, preview only, no Meta call", async () => {
  const calls = { text: 0, photo: 0 }
  const t = await handleInbound({ id: "m1", from: "5215512345678", timestamp: "1", type: "text", text: "Tenemos 20 cajas de pan en la colonia Roma", mediaId: null }, { deps: localDeps(calls), allowlist: undefined, send: null, fetchMedia: null, source: "simulator" })
  assert.deepEqual(calls, { text: 0, photo: 0 })
  assert.equal(t.replyStatus, "preview")
  assert.match(t.reply!, /Registré: 20 cajas, pan, en Roma/)
  assert.match(t.reply!, /hora/)
  assert.match(t.reply!, /Una persona del equipo/)
  assert.equal(t.from, "••••5678")
})

test("handler: a blocked sender costs nothing and gets no reply", async () => {
  let sent = 0
  const t = await handleInbound({ id: "m2", from: "5215599999999", timestamp: "1", type: "text", text: "pan", mediaId: null }, { deps: localDeps(), allowlist: "5215512345678", send: async () => { sent++; return "x" }, fetchMedia: null, source: "webhook" })
  assert.equal(sent, 0)
  assert.equal(t.reply, null)
})

test("handler: photo with visible mold blocks people routes and asks about damage", async () => {
  const t = await handleInbound({ id: "m3", from: "5215512345678", timestamp: "1", type: "image", text: "Tenemos 20 cajas de pan fresco en la colonia Roma antes de las 5 pm", mediaId: "media" }, { deps: localDeps(), allowlist: undefined, send: async () => "wamid.out", fetchMedia: async () => JPEG, photoFixture: "mold", source: "simulator" })
  assert.equal(t.intake?.condition?.peopleRouteBlocked, true)
  assert.match(t.reply!, /posible daño/)
  assert.equal(t.replyStatus, "sent")
})

test("handler: a failed media download continues with the caption and says so", async () => {
  const t = await handleInbound({ id: "m4", from: "1", timestamp: "1", type: "image", text: "pan", mediaId: "m" }, { deps: localDeps(), allowlist: undefined, send: null, fetchMedia: async () => { throw new Error("media_too_large") }, source: "webhook" })
  assert.ok(t.steps.some(s => s.step === "photo" && /media_too_large/.test(s.detail)))
})

test("English messages get English replies", () => {
  assert.equal(looksEnglish("We have about 12 boxes of apples"), true)
  assert.equal(looksEnglish("Tenemos 20 cajas de pan"), false)
  const r = composeReply("We have stuff", { provider: "", model: null, extraction: { events: [], residual_text: "", needs_review: false, review_reasons: [] }, supply: null, photo: null, condition: null, candidates: [], metaCalls: 0 })
  assert.match(r, /didn't find a food offer/)
})

test("public traces withhold reply text and offer details from real senders", async () => {
  const { recordTrace, recentTraces } = await import("../lib/whatsapp/handler.ts")
  const t = await handleInbound({ id: "m5", from: "5215512345678", timestamp: "1", type: "text", text: "Tenemos 20 cajas de pan en la colonia Roma", mediaId: null }, { deps: localDeps(), allowlist: undefined, send: null, fetchMedia: null, source: "webhook" })
  recordTrace(t)
  const pub = recentTraces().find(x => x.id === "m5")!
  assert.equal(pub.reply, "(withheld: real sender)")
  assert.equal(pub.intake?.supply, null)
})
