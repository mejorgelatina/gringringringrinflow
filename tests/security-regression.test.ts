import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, createRateLimiter } from "../lib/whatsapp/rate-limit.ts";
import { recordTrace, recentTraces, type Trace } from "../lib/whatsapp/handler.ts";

// Security regressions: the shared rate limiter budget and the public trace redaction.

test("the limiter allows a burst, then blocks until the window passes", () => {
  const overLimit = createRateLimiter(60_000, 3);
  assert.equal(overLimit("ip", 0), false);
  assert.equal(overLimit("ip", 1_000), false);
  assert.equal(overLimit("ip", 2_000), false);
  assert.equal(overLimit("ip", 3_000), true);
  assert.equal(overLimit("ip", 61_000), false, "the first hit aged out of the window");
});

test("the limiter isolates keys from each other", () => {
  const overLimit = createRateLimiter(60_000, 1);
  assert.equal(overLimit("a", 0), false);
  assert.equal(overLimit("a", 0), true);
  assert.equal(overLimit("b", 0), false);
});

test("clientIp reads the first forwarded address, or unknown", () => {
  assert.equal(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } })), "1.2.3.4");
  assert.equal(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "  9.9.9.9  " } })), "9.9.9.9");
  assert.equal(clientIp(new Request("http://x")), "unknown");
});

function traceWithSender(id: string, source: Trace["source"]): Trace {
  return {
    id, source, from: "••••5678", receivedAt: new Date(0).toISOString(),
    steps: [
      { at: new Date(0).toISOString(), step: "received", detail: "text message (12 chars)" },
      { at: new Date(0).toISOString(), step: "sender", detail: "registered as Comedor Santa Fe (verified)" },
    ],
    reply: "¡Gracias! Registré: pan.",
    replyStatus: "preview",
    metaCalls: 0,
    intake: { provider: "local", supply: { item: "pan" }, demand: null, condition: null, photo: null, icc: null, feasible: 1, blocked: 0 } as never,
  };
}

test("public traces withhold the sender step for real senders, simulators stay intact", () => {
  recordTrace(traceWithSender("m4-real", "webhook"));
  recordTrace(traceWithSender("m4-sim", "simulator"));
  const real = recentTraces().find((t) => t.id === "m4-real")!;
  assert.equal(real.reply, "(withheld: real sender)");
  assert.equal(real.steps.find((s) => s.step === "sender")?.detail, "(withheld: real sender)");
  assert.equal(real.steps.find((s) => s.step === "received")?.detail, "text message (12 chars)");
  assert.equal(real.intake?.supply, null);
  const sim = recentTraces().find((t) => t.id === "m4-sim")!;
  assert.match(sim.reply ?? "", /Registré/);
  assert.match(sim.steps.find((s) => s.step === "sender")?.detail ?? "", /Comedor Santa Fe/);
});
