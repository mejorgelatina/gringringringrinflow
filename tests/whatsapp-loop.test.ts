import assert from "node:assert/strict"
import { test } from "node:test"

import { localJudge } from "../lib/agent/judge.ts"
import { resumeRun } from "../lib/agent/loop.ts"
import { createScriptedPlanner } from "../lib/agent/planner.ts"
import { unseal } from "../lib/agent/state.ts"
import type { AgentDeps } from "../lib/agent/tools.ts"
import { extractLocally } from "../lib/meta/meta.ts"
import { createMemoryStore, type RegistryStore } from "../lib/registry/store.ts"
import type { Registration } from "../lib/registry/types.ts"
import { setRegisteredParticipants } from "../lib/network/live.ts"
import { autoAgentEnabled, createAgentBridge, publicBaseUrl } from "../lib/whatsapp/agent-bridge.ts"
import { notifyApproval } from "../lib/whatsapp/approval.ts"
import { handleInbound } from "../lib/whatsapp/handler.ts"
import { deliverNotices, insideServiceWindow, planApprovalNotices, planVerifiedNotice, renderTemplate, TEMPLATES, type TemplateName } from "../lib/whatsapp/notify.ts"

// Offline: scripted planner, local extraction, no network, no Meta credits.
const deps: AgentDeps = {
  useMeta: false, modelId: null, visionModelId: null,
  extractWithMeta: async () => { throw new Error("must not be called") },
  extractLocally,
  assessPhotoWithMeta: async () => { throw new Error("must not be called") },
  judge: localJudge,
}
const BREAD = "Tenemos 20 cajas de pan fresco en la colonia Roma, hay que recogerlas antes de las 6 pm."

function setup() {
  setRegisteredParticipants([])
  const tokens = new Map<string, string>()
  const store = createMemoryStore()
  const agent = createAgentBridge({ deps: () => deps, planner: () => createScriptedPlanner(), remember: async (c, t) => { tokens.set(c, t) }, lookup: async (c) => tokens.get(c) ?? null, baseUrl: "https://grinflow.test" })
  let n = 0
  const say = (text: string, from = "5215511112222", source: "webhook" | "simulator" = "webhook") => handleInbound(
    { id: `m${n++}`, from, timestamp: "1", type: "text", text, mediaId: null },
    { deps, allowlist: undefined, send: null, fetchMedia: null, source, store, agent },
  )
  return { store, agent, tokens, say }
}

test("a complete whatsapp offer opens an agent run by itself and the donor gets a tracking link", async () => {
  const { store, tokens, say } = setup()
  const t = await say(BREAD)
  assert.equal(t.agentRun?.started, true)
  assert.equal(t.agentRun?.status, "awaiting_approval")
  const code = t.agentRun!.code
  assert.match(t.reply!, new RegExp(`Seguimiento ${code}: https://grinflow.test/track/${code}`))
  assert.match(t.reply!, /Una persona del equipo lo aprueba/)
  assert.ok(tokens.has(code), "the run is stored under its code, like the console does")
  const [row] = await store.listInbox()
  assert.equal(row.runCode, code)
  assert.equal(row.runStatus, "awaiting_approval")
  const link = await store.getRunLink(code)
  assert.equal(link?.phone, "5215511112222")
  assert.equal(link?.inboxId, row.id)
})

test("after one answer the agent takes over, asks in the chat, and the donor's reply moves the same run", async () => {
  const { store, say } = setup()
  const first = await say("Nos sobraron como unas 15 cajas de jitomate en Centro")
  assert.equal(first.agentRun, undefined, "the intake asks first; no run yet")
  const second = await say("antes de las 5 pm")
  assert.equal(second.agentRun?.started, true)
  assert.equal(second.agentRun?.status, "needs_input")
  assert.match(second.reply!, /\?/)
  const conv = await store.getConversation("webhook:5215511112222")
  assert.equal(conv?.activeRun?.code, second.agentRun!.code)
  assert.equal(conv?.openQuestion, false, "the agent owns the question now")

  const third = await say("son 15 cajas exactas, frescas")
  assert.deepEqual(third.agentRun, { code: second.agentRun!.code, status: "awaiting_approval", started: false })
  assert.match(third.reply!, /Encontramos destino/)
  const row = (await store.listInbox()).find((r) => r.runCode === second.agentRun!.code)
  assert.equal(row?.runStatus, "awaiting_approval", "the team inbox follows the run")
  assert.equal((await store.getConversation("webhook:5215511112222"))?.activeRun, null)
})

test("a new complete offer after an unanswered question starts fresh instead of merging", async () => {
  const { say } = setup()
  await say("unos 60 kilos")
  const t = await say("Nos sobraron 15 cajas de jitomate en Centro, recoger antes de las 5 pm")
  assert.ok(t.steps.every((s) => !/continuing the conversation/.test(s.detail)))
  assert.equal(t.intake?.supply?.quantity, 15)
})

test("GRINFLOW_AUTO_AGENT=off and the base url", () => {
  assert.equal(autoAgentEnabled({}), true)
  assert.equal(autoAgentEnabled({ GRINFLOW_AUTO_AGENT: "off" }), false)
  assert.equal(publicBaseUrl({ GRINFLOW_BASE_URL: "https://grinflow.app/" }), "https://grinflow.app")
  assert.equal(publicBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: "grinflow.vercel.app" }), "https://grinflow.vercel.app")
  assert.equal(publicBaseUrl({ GRINFLOW_BASE_URL: "grinflow.app" }), null)
})

test("templates render every parameter, and the drafts' examples fit", () => {
  for (const [name, t] of Object.entries(TEMPLATES)) {
    const body = renderTemplate(name as TemplateName, [...t.example])
    assert.doesNotMatch(body, /\{\{/, name)
    assert.ok(body.length < 1024, name)
    assert.equal(TEMPLATES[name as TemplateName].body.match(/\{\{\d+\}\}/g)?.length, t.example.length, name)
  }
})

const verifiedReceiver = (over: Partial<Registration> = {}): Registration => ({
  id: "reg-comedor", phone: "5215599998888", source: "webhook", name: "comedor la esperanza", roles: ["receiver"], address: null, location: { lat: 19.42, lng: -99.16 }, locationSource: "colonia", area: "roma",
  hours: null, hoursText: "", contacts: [], accepts: null, generates: null, selfPickup: true, whatsappOptIn: true, status: "verified",
  createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z", verifiedAt: "2026-11-01T00:00:00.000Z", verifiedBy: "ana", notes: null, ...over,
})

async function approvedRun(store: RegistryStore, tokens: Map<string, string>, code: string, recipientId?: string) {
  const run = unseal(tokens.get(code)!)!
  if (recipientId) run.proposal = { ...run.proposal!, recipientId, recipient: "comedor la esperanza" }
  return resumeRun(run, { type: "decision", decision: "approved", reviewer: "ana", notes: "" }, deps, createScriptedPlanner())
}

test("approval: the donor gets text inside 24 h, a template after; the receiver only a template, only with opt-in", async () => {
  const { store, tokens, say } = setup()
  const t = await say(BREAD)
  const run = await approvedRun(store, tokens, t.agentRun!.code)
  const link = await store.getRunLink(run.code)
  const now = new Date(Date.parse(link!.lastInboundAt) + 3600_000)

  const inside = planApprovalNotices(run, link, verifiedReceiver(), "https://grinflow.test", now)
  assert.deepEqual(inside.map((n) => [n.audience, n.mode]), [["donor", "session"], ["receiver", "template"]])
  assert.match(inside[0].body, new RegExp(`https://grinflow.test/track/${run.code}`))
  assert.equal(inside[1].template?.name, "grinflow_donacion_asignada")
  assert.match(inside[1].body, /comedor la esperanza/)

  const later = planApprovalNotices(run, link, null, "https://grinflow.test", new Date(Date.parse(link!.lastInboundAt) + 25 * 3600_000))
  assert.equal(later[0].mode, "template")
  assert.equal(later[0].template?.name, "grinflow_donacion_aprobada")
  assert.equal(insideServiceWindow(null, now), false)

  const sent: string[] = []
  const out = { sendText: async (to: string) => { sent.push(`text:${to}`); return "wamid.1" }, sendTemplate: null }
  const delivered = await deliverNotices(inside, out, { store, optIn: (d) => d.audience !== "receiver" })
  assert.deepEqual(delivered.map((n) => n.status), ["sent", "skipped"])
  assert.deepEqual(sent, ["text:5215511112222"])
  assert.equal((await store.listNotices()).length, 2)

  const noTemplates = await deliverNotices([inside[1]], { sendText: out.sendText, sendTemplate: null })
  assert.equal(noTemplates[0].status, "preview")
  assert.match(noTemplates[0].detail, /WHATSAPP_TEMPLATES_APPROVED/)
})

test("notifyApproval: simulator runs are previewed, never sent, and the inbox row turns approved", async () => {
  const { store, tokens, say } = setup()
  await store.saveRegistration(verifiedReceiver({ source: "simulator" }))
  const t = await say(BREAD, "5215500000000", "simulator")
  const run = await approvedRun(store, tokens, t.agentRun!.code, "reg-comedor")
  let calls = 0
  const out = { sendText: async () => { calls++; return null }, sendTemplate: async () => { calls++; return null } }
  const notices = await notifyApproval(run, store, out, "https://grinflow.test")
  assert.deepEqual(notices.map((n) => [n.audience, n.status]), [["donor", "preview"], ["receiver", "preview"]])
  assert.equal(calls, 0)
  assert.equal((await store.listInbox())[0].runStatus, "approved")
})

test("verifying an organization drafts the welcome template", () => {
  const n = planVerifiedNotice(verifiedReceiver(), new Date("2026-11-02T12:00:00Z"))
  assert.equal(n?.template?.name, "grinflow_registro_verificado")
  assert.match(n!.body, /^comedor la esperanza ya está verificada/)
  assert.equal(planVerifiedNotice(verifiedReceiver({ status: "pending" }), new Date()), null)
})
