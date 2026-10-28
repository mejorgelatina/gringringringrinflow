#!/usr/bin/env node
/**
 * Safe Meta Model API diagnostic.
 * Run with MODEL_API_KEY set in the environment. Never prints the key.
 * First tests model listing, then basic inference, then JSON mode separately.
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

const jsonMode = await request("/chat/completions", {
  model,
  temperature: 0,
  response_format: { type: "json_object" },
  messages: [
    { role: "system", content: "Return a JSON object with one key, ok, whose value is true." },
    { role: "user", content: "Return the JSON object." }
  ]
});
console.log(`3. JSON-mode inference: HTTP ${jsonMode.status}`);
if (!jsonMode.ok) {
  console.error(`   Failed: ${summarizeFailure(jsonMode)}`);
  console.error("   Basic inference works; investigate endpoint/model support for JSON mode or response_format.");
  process.exit(1);
}
try {
  const content = jsonMode.parsed?.choices?.[0]?.message?.content;
  const obj = JSON.parse(content);
  if (obj.ok !== true) throw new Error("Expected { ok: true }");
  console.log("   JSON mode succeeded and returned valid JSON.");
} catch (error) {
  console.error(`   Request succeeded but response did not validate as expected: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
}
console.log("PASS: model listing, basic inference, and JSON mode all succeeded.");
