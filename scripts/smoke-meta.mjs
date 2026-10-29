#!/usr/bin/env node
/**
 * Explicit-cost Meta Model API diagnostic.
 * Default: list models only (no inference). Choose exactly one inference mode intentionally.
 * Never prints the API key. Inference may consume credits.
 *
 * Usage:
 *   npm run smoke:meta                 # list models only; zero inference calls
 *   npm run smoke:meta -- --basic      # exactly one basic inference call
 *   npm run smoke:meta -- --structured # exactly one JSON Schema inference call
 *   npm run smoke:meta -- --all        # model list + two inference calls (explicitly opt in)
 */
const key = process.env.MODEL_API_KEY;
const baseURL = (process.env.META_BASE_URL || "https://api.meta.ai/v1").replace(/\/$/, "");
const model = process.env.META_MODEL_ID || "muse-spark-1.3";
const args = new Set(process.argv.slice(2));
const modes = ["--list", "--basic", "--structured", "--all"].filter((flag) => args.has(flag));
if (args.has("--help") || args.has("-h")) {
  console.log("Usage: npm run smoke:meta -- [--list|--basic|--structured|--all]");
  console.log("Default is --list (no inference). --basic and --structured each make one inference call. --all makes two.");
  process.exit(0);
}
if (args.size > 1 || modes.length > 1) {
  console.error("Choose only one mode: --list, --basic, --structured, or --all.");
  process.exit(2);
}
const mode = modes[0] || "--list";
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
async function infer(body, label, validate) {
  const result = await request("/chat/completions", body);
  console.log(`${label}: HTTP ${result.status}`);
  if (!result.ok) {
    console.error(`   Failed: ${summarizeFailure(result)}`);
    process.exit(1);
  }
  const content = result.parsed?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.length) {
    console.error("   Request succeeded but response had no message content.");
    process.exit(1);
  }
  try { validate(content); }
  catch (error) {
    console.error(`   Response validation failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exit(1);
  }
}
console.log(`Meta API diagnostic · mode=${mode} · base=${baseURL} · model=${model}`);
if (mode === "--list" || mode === "--all") {
  const listing = await request("/models");
  console.log(`Model listing: HTTP ${listing.status}`);
  if (!listing.ok) {
    console.error(`   Failed: ${summarizeFailure(listing)}`);
    process.exit(1);
  }
  const modelIds = Array.isArray(listing.parsed?.data) ? listing.parsed.data.map(x => x?.id).filter(Boolean) : [];
  console.log(`   ${modelIds.length} model IDs returned; configured model appears in listing: ${modelIds.includes(model) ? "yes" : "no/unknown"}`);
  if (mode === "--list") {
    console.log("PASS: model listing only. No inference calls were made.");
    process.exit(0);
  }
}
if (mode === "--basic" || mode === "--all") {
  await infer({
    model,
    temperature: 0,
    max_tokens: 8,
    messages: [{ role: "user", content: "Reply with exactly: OK" }]
  }, "Basic inference", (content) => {
    if (content.trim() !== "OK") throw new Error(`Expected OK, received ${JSON.stringify(content.slice(0, 80))}`);
  });
  console.log("   Basic inference returned OK.");
}
if (mode === "--structured" || mode === "--all") {
  await infer({
    model,
    temperature: 0,
    max_tokens: 30,
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
  }, "JSON Schema inference", (content) => {
    const obj = JSON.parse(content);
    if (obj.ok !== true) throw new Error("Expected { ok: true }");
  });
  console.log("   JSON Schema structured output returned valid JSON.");
}
console.log("PASS: selected diagnostic completed.");
