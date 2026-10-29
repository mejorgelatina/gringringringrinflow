import assert from "node:assert/strict"
import { test } from "node:test"

import { localJudge } from "../lib/agent/judge.ts"
import { resumeRun, startRun } from "../lib/agent/loop.ts"
import { createMetaPlanner, createScriptedPlanner, type Planner, type PlannerStep } from "../lib/agent/planner.ts"
import { seal, unseal } from "../lib/agent/state.ts"
import type { AgentDeps } from "../lib/agent/tools.ts"
import type { AgentRun } from "../lib/agent/types.ts"
import { extractLocally } from "../lib/meta/meta.ts"

// Every test here runs offline: no key, no network, no Meta credits.
const JPEG = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString("base64")
const BREAD = "Tenemos 20 cajas de pan fresco en la colonia Roma, hay que recogerlas antes de las 6 pm."

function offline(over: Partial<AgentDeps> = {}): AgentDeps {
  return {
    useMeta: false, modelId: null, visionModelId: null,
    extractWithMeta: async () => { throw new Error("no network in tests") },
    extractLocally,
    assessPhotoWithMeta: async () => { throw new Error("no network in tests") },
    judge: localJudge,
    ...over,
  }
}

/** A stand-in for Muse Spark: plays back fixed tool calls, so the checks can be tested against a misbehaving planner. */
function scripted(steps: (PlannerStep | ((run: AgentRun) => PlannerStep))[]): Planner & { calls: number } {
  const planner = {
    name: "test planner", usesMeta: true, calls: 0,
    async next(run: AgentRun) { const s = steps[planner.calls++]; if (!s) throw new Error("script ended"); return typeof s === "function" ? s(run) : s },
  }
  return planner
}
const call = (name: string, args: Record<string, unknown> = {}): PlannerStep => ({ kind: "call", callId: `c_${name}_${Math.random()}`, name, arguments: JSON.stringify(args) })
const tools = (run: AgentRun) => run.turns.map(t => `${t.tool}:${t.outcome}`)

test("AG-01: a clear offer goes message → extract → match → checked proposal → sign-off, with zero Meta calls", async () => {
  const run = await startRun(BREAD, undefined, offline(), createScriptedPlanner())
  assert.deepEqual(tools(run), ["extract_event:ok", "find_matches:ok", "propose_match:stopped"])
  assert.equal(run.status, "awaiting_approval")
  assert.equal(run.proposal?.tier, "people")
  assert.equal(run.proposal?.judge.supported, true)
  assert.equal(run.metaCalls, 0)
  const done = await resumeRun(run, { type: "decision", decision: "approved", reviewer: "ana", notes: "" }, offline(), createScriptedPlanner())
  assert.equal(done.status, "approved")
  assert.equal(done.turns.length, 4)
})

test("AG-02: an estimated quantity makes the agent ask the donor, and the answer resumes the same run", async () => {
  const run = await startRun("Nos sobraron como unas 15 cajas de jitomate en Centro", undefined, offline(), createScriptedPlanner())
  assert.equal(run.status, "needs_input")
  assert.equal(run.question?.field, "quantity")
  const next = await resumeRun(run, { type: "donor_reply", text: "son 15 cajas exactas, frescas, antes de las 17" }, offline(), createScriptedPlanner())
  assert.equal(next.supply?.quantityBasis, "stated")
  assert.equal(next.supply?.location, "Centro")
  assert.equal(next.status, "awaiting_approval")
  assert.ok(next.proposal?.quotes.every(q => next.donorTexts.join("\n").includes(q)))
})

test("AG-03: a photo with mold goes to an operator; after inspection only valorization is proposed", async () => {
  const msg = "Tenemos 12 cajas de manzanas frescas en la colonia Roma, recoger antes de las 4 pm"
  const run = await startRun(msg, JPEG, offline({ photoFixture: "mold" }), createScriptedPlanner())
  assert.equal(run.condition?.effective, "unknown")
  assert.equal(run.status, "escalated")
  assert.ok(tools(run).includes("ask_operator:stopped"))
  const next = await resumeRun(run, { type: "inspection", condition: "inedible", reviewer: "ana" }, offline(), createScriptedPlanner())
  assert.equal(next.status, "awaiting_approval")
  assert.equal(next.proposal?.tier, "valorization")
})

test("AG-04: invented quotes and blocked pairs are refused in code; three refusals hand the run to a person", async () => {
  const planner = scripted([
    call("extract_event"),
    call("find_matches"),
    call("propose_match", { recipientId: "recip-a", capacityId: "cap-a", rationale: "20 cajas de pan para La Esperanza.", quotes: ["40 cajas de pan"] }),
    call("propose_match", { recipientId: "recip-a", capacityId: "cap-b", rationale: "20 cajas de pan para La Esperanza.", quotes: ["20 cajas de pan"] }),
    call("propose_match", { recipientId: "recip-x", capacityId: "cap-a", rationale: "20 cajas de pan.", quotes: ["20 cajas de pan"] }),
  ])
  const run = await startRun(BREAD, undefined, offline(), planner)
  assert.deepEqual(run.turns.slice(2).map(t => t.check), ["proposal_rules", "proposal_rules", "proposal_rules"])
  assert.match(run.turns[2].summary, /quote not found/)
  assert.match(run.turns[3].summary, /transport availability is not confirmed/)
  assert.equal(run.status, "escalated")
  assert.equal(run.proposal, null)
})

test("AG-05: the claims check refuses a rationale that says more than its quotes", async () => {
  const planner = scripted([
    call("extract_event"), call("find_matches"),
    call("propose_match", { recipientId: "recip-a", capacityId: "cap-a", rationale: "50 cajas de pan, recoger a las 9.", quotes: ["20 cajas de pan"] }),
  ])
  const run = await startRun(BREAD, undefined, offline(), planner)
  assert.equal(run.turns[2].check, "claims_check")
  assert.match(run.turns[2].summary, /50/)
  assert.equal(run.refusals, 1)
})

test("AG-06: plain text is refused, asking about a known field is refused, food for people is never proposed on an unknown condition", async () => {
  const planner = scripted([
    { kind: "text", text: "I think this should go to the food bank." },
    call("extract_event"),
    call("ask_donor", { field: "location", question: "¿dónde?" }),
    call("find_matches"),
    call("propose_match", { recipientId: "recip-a", capacityId: "cap-a", rationale: "20 cajas de pan en Roma.", quotes: ["20 cajas de pan"] }),
  ])
  const run = await startRun("Tenemos 20 cajas de pan en la colonia Roma, antes de las 6 pm.", undefined, offline(), planner)
  assert.equal(run.turns[0].check, "one_tool_per_turn")
  assert.equal(run.turns[2].check, "question_check")
  assert.equal(run.turns[4].check, "proposal_rules")
  assert.match(run.turns[4].summary, /condition/)
})

test("AG-07: a failed planner call pauses the run once, with no retry", async () => {
  const planner = scripted([])
  const run = await startRun(BREAD, undefined, offline(), planner)
  assert.equal(run.status, "paused")
  assert.equal(planner.calls, 1)
  assert.equal(run.metaCalls, 1)
})

test("AG-08: the Muse Spark planner sends the run as Responses API input, one tool at a time, nothing stored", async () => {
  const bodies: Record<string, unknown>[] = []
  const client = { responses: { create: async (body: Record<string, unknown>) => { bodies.push(body); return { output: [{ type: "function_call", call_id: "call_1", name: "extract_event", arguments: "{}" }] } } } }
  const step = await createMetaPlanner(client, "muse-spark-1.3").next({ items: [{ role: "user", content: "hola" }], turns: [] } as unknown as AgentRun)
  assert.deepEqual(step, { kind: "call", callId: "call_1", name: "extract_event", arguments: "{}" })
  assert.equal(bodies[0].parallel_tool_calls, false)
  assert.equal(bodies[0].store, false)
  assert.equal((bodies[0].tools as unknown[]).length, 6)
})

test("AG-09: a run edited in the browser cannot be resumed", async () => {
  const run = await startRun(BREAD, undefined, offline(), createScriptedPlanner())
  const token = seal(run)
  assert.equal(unseal(token)?.id, run.id)
  const [body, mac] = token.split(".")
  const forged = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  forged.status = "approved"
  assert.equal(unseal(`${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${mac}`), null)
})

test("AG-10: a rejected pair is not proposed again", async () => {
  const run = await startRun(BREAD, undefined, offline(), createScriptedPlanner())
  const first = run.proposal!.recipientId
  const next = await resumeRun(run, { type: "decision", decision: "rejected", reviewer: "ana", notes: "they are closed today" }, offline(), createScriptedPlanner())
  assert.notEqual(next.proposal?.recipientId ?? "none", first)
})
