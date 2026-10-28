#!/usr/bin/env node
/**
 * Safe Meta Model API diagnostic.
 * Run with MODEL_API_KEY set in the environment. Never prints the key.
 * First tests model listing, then basic inference, then schema-constrained JSON output.
 * This script makes two inference calls and may consume credits; run only by explicit choice.
 */
const key = process.env.MODEL_API_KEY;
const baseURL = (process.env.META_BASE_URL || "https://api.meta.ai/v1").replace(/\/$/, "");
const model = process.env.META_MODEL_ID || "muse-spark-1.3";

if (!key) {
  console.error("BLOCKED: MODEL_API_KEY is not set. Set it in your local shell; never commit it.");
  process.exit(2);
}

async function request(path, body) {
  const response = await fetch(`${baseURL}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000)
  });
  const raw = await response.text();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  return { status: response.status, ok: response.ok, parsed, raw: parsed ? "" : raw.slice(0, 400) };
}

function summarizeFailure(result) {
  const providerMessage = result.parsed?.error?.message || result.parsed?.message || result.raw || "No response body";
  return String(providerMessage).replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]").slice(0, 500);
}

console.log(`Meta API smoke test · base=${baseURL} · model=${model}`);
const listing = await request("/models");
console.log(`1. GET /models: HTTP ${listing.status}`);
if (!listing.ok) {
  console.error(`   Failed: ${summarizeFailure(listing)}`);
  console.error("   Stop here: check key, account, and base URL.");
  process.exit(1);
}
const modelIds = Array.isArray(listing.parsed?.data) ? listing.parsed.data.map(x => x?.id).filter(Boolean) : [];
console.log(`   Model listing succeeded (${modelIds.length} IDs returned). This does NOT prove inference access.`);
console.log(`   Configured model appears in listing: ${modelIds.includes(model) ? "yes" : "no/unknown"}`);

const basic = await request("/chat/completions", {
  model,
  temperature: 0,
  messages: [{ role: "user", content: "Reply with exactly: OK" }]
});
console.log(`2. Basic inference: HTTP ${basic.status}`);
if (!basic.ok) {
  console.error(`   Failed: ${summarizeFailure(basic)}`);
  console.error("   Diagnose billing/payment method/visible credits/account model access before changing app code.");
  process.exit(1);
}
const basicText = basic.parsed?.choices?.[0]?.message?.content;
console.log(`   Inference succeeded. Response preview: ${String(basicText ?? "[no message content]").slice(0, 100)}`);

const structured = await request("/chat/completions", {
  model,
  messages: [
    { role: "system", content: "Return an object whose ok field is true." },
    { role: "user", content: "Return the requested object." }
  ],
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "smoke_check",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { ok: { type: "boolean" } },
        required: ["ok"]
      }
    }
  }
});
console.log(`3. JSON Schema structured-output inference: HTTP ${structured.status}`);
if (!structured.ok) {
  console.error(`   Failed: ${summarizeFailure(structured)}`);
  console.error("   Basic inference works; investigate structured-output schema support/request format.");
  process.exit(1);
}
try {
  const content = structured.parsed?.choices?.[0]?.message?.content;
  const obj = JSON.parse(content);
  if (obj.ok !== true) throw new Error("Expected { ok: true }");
  console.log("   JSON Schema structured output succeeded and returned valid JSON.");
} catch (error) {
  console.error(`   Request succeeded but response did not validate as expected: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
}
console.log("PASS: model listing, basic inference, and JSON Schema structured output all succeeded.");
