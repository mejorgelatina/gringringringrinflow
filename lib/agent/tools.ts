import { evaluateCandidates } from "../engines/matching.mjs";
import type { IntakeDeps, Supply } from "../intake/process.ts";
import { LOCAL_PROVIDER } from "../intake/process.ts";
import { assessPhotoLocally, PHOTO_FIXTURES, resolveCondition, routePhotoAssessment, type ObservedCondition } from "../meta/photo-policy.ts";
import type { Extraction } from "../meta/types.ts";
import { checkHandoff, checkProposal, checkQuestion, MAX_ASKS } from "./checks.ts";
import type { AgentRun, Candidate } from "./types.ts";

export type Judge = (rationale: string, quotes: string[], facts: string) => Promise<{ by: string; supported: boolean; note: string }>;

export type AgentDeps = IntakeDeps & { judge: Judge; photoFixture?: keyof typeof PHOTO_FIXTURES };

/** What a tool gets besides its arguments. The image only lives for the request that carried it; it is never stored. */
export type ToolContext = { run: AgentRun; deps: AgentDeps; image?: string };

/** A tool result goes back to the planner as written. `refused` carries the check that stopped it. */
export type ToolResult = { ok: boolean; refused?: string; summary: string; data: Record<string, unknown> };

export { MAX_ASKS };
export const MAX_REFUSALS = 3;

const NO_ARGS = { type: "object", additionalProperties: false, properties: {}, required: [] };

export const TOOL_DEFINITIONS = [
  { type: "function", name: "extract_event", description: "Read the donor's newest message(s) and update the structured offer: item, quantity and whether it was stated or estimated, condition, deadline, pickup location. Every field comes with the exact quote it was taken from.", parameters: NO_ARGS },
  { type: "function", name: "assess_photo", description: "Describe the donor's photo, if one was sent: visible items, damage, legibility. A photo can only lower confidence in condition, never certify food as safe.", parameters: NO_ARGS },
  { type: "function", name: "find_matches", description: "Run grinflow's deterministic matching engine on the current offer. Returns feasible recipient + transport pairs and, for blocked pairs, the hard constraints that block them. You cannot override a blocker.", parameters: NO_ARGS },
  {
    type: "function", name: "ask_donor",
    description: "Ask the donor one question about one missing or uncertain field. The run pauses until the donor answers. Allowed only for a field that is actually missing or uncertain, at most twice per offer.",
    parameters: { type: "object", additionalProperties: false, properties: { field: { type: "string", enum: ["quantity", "deadline_hour", "location", "category", "condition", "offer"] }, question: { type: "string", description: "one short question, in the donor's language" } }, required: ["field", "question"] }
  },
  {
    type: "function", name: "ask_operator",
    description: "Hand the offer to a grinflow operator when the donor cannot resolve it (for example, the photo shows damage and someone must inspect). The run pauses until the operator acts.",
    parameters: { type: "object", additionalProperties: false, properties: { reason: { type: "string" } }, required: ["reason"] }
  },
  {
    type: "function", name: "propose_match",
    description: "Propose one feasible recipient + transport pair from find_matches for operator approval. Checked by code and by a separate reviewer before it reaches the operator: the pair must be feasible now, and every fact in the rationale must come from the quotes, which must be exact substrings of what the donor wrote.",
    parameters: { type: "object", additionalProperties: false, properties: { recipientId: { type: "string" }, capacityId: { type: "string" }, rationale: { type: "string", description: "one or two sentences: what moves where, and why this pair" }, quotes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 } }, required: ["recipientId", "capacityId", "rationale", "quotes"] }
  }
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["name"];
export const TOOL_NAMES = TOOL_DEFINITIONS.map(t => t.name) as ToolName[];

const refuse = (check: string, summary: string, data: Record<string, unknown> = {}): ToolResult => ({ ok: false, refused: check, summary, data: { error: summary, ...data } });

export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  switch (name) {
    case "extract_event": return extractEvent(ctx);
    case "assess_photo": return assessPhoto(ctx);
    case "find_matches": return findMatches(ctx);
    case "ask_donor": return askDonor(ctx, String(args.field ?? ""), String(args.question ?? ""));
    case "ask_operator": return askOperator(ctx, String(args.reason ?? ""));
    case "propose_match": return proposeMatch(ctx, args);
    default: return refuse("unknown_tool", `unknown tool: ${name}`);
  }
}

/** Newer answers fill or correct the offer; a field the donor didn't mention keeps its earlier value. */
export function mergeSupply(prev: Supply | null, next: Supply | null): Supply | null {
  if (!prev) return next;
  if (!next) return prev;
  const quantityChanged = next.quantity != null;
  return {
    item: next.item ?? prev.item,
    category: next.category ?? prev.category,
    quantity: quantityChanged ? next.quantity : prev.quantity,
    quantityBasis: quantityChanged ? next.quantityBasis : prev.quantityBasis,
    condition: next.condition !== "unknown" ? next.condition : prev.condition,
    deadlineHour: next.deadlineHour ?? prev.deadlineHour,
    location: next.location ?? prev.location
  };
}

function toSupply(extraction: Extraction): Supply | null {
  const e = extraction.events.find(ev => ev.kind === "supply_announced") ?? (extraction.events.length === 1 && extraction.events[0].kind !== "demand_declared" && extraction.events[0].kind !== "unknown" ? extraction.events[0] : undefined);
  return e ? { item: e.item, category: e.category, quantity: e.quantity, quantityBasis: e.quantity_basis, condition: e.condition, deadlineHour: e.deadline_hour, location: e.location } : null;
}

function observedCondition(run: AgentRun): ObservedCondition {
  if (!run.photo) return "not_assessed";
  return run.photo.status === "failed" ? "assessment_failed" : run.photo.routing.suggestedCondition;
}

/** supply.condition is always the effective one; what the donor said lives in condition.stated. */
function refreshCondition(run: AgentRun, stated = run.condition?.stated ?? run.supply?.condition ?? "unknown") {
  if (!run.supply) return;
  run.condition = resolveCondition(stated, observedCondition(run), run.condition?.humanConfirmed ?? null);
  run.supply = { ...run.supply, condition: run.condition.effective };
}

async function extractEvent({ run, deps }: ToolContext): Promise<ToolResult> {
  const fresh = run.donorTexts.slice(run.extractedTexts);
  if (!fresh.length) return refuse("nothing_new", "every donor message is already extracted; use the current offer");
  const text = fresh.join("\n");
  if (deps.useMeta) run.metaCalls++;
  const extraction = deps.useMeta ? await deps.extractWithMeta(text) : deps.extractLocally(text);
  // Quote check outside the model: an event whose quote is not in what the donor wrote never enters the record.
  const kept = extraction.events.filter(e => text.includes(e.quote));
  const dropped = extraction.events.length - kept.length;
  const checked: Extraction = { ...extraction, events: kept };
  const isFollowUp = run.extractedTexts > 0 && run.supply != null;
  run.extraction = isFollowUp && run.extraction ? { ...checked, events: [...run.extraction.events, ...kept] } : checked;
  run.extractedTexts = run.donorTexts.length;
  const next = toSupply(checked);
  run.supply = isFollowUp ? mergeSupply(run.supply, next) : next;
  // A donor's later "they're fresh" restates condition; a person's inspection still wins (resolveCondition).
  const stated = next && next.condition !== "unknown" ? next.condition : run.condition?.stated ?? next?.condition ?? "unknown";
  run.supplyVersion++;
  refreshCondition(run, stated);
  const s = run.supply;
  // Reported against the merged offer, not the latest message alone, so a follow-up doesn't re-list fields already known.
  const missing = s ? [s.quantity == null && "quantity", s.category == null && "category", s.location == null && "location", s.deadlineHour == null && "deadline_hour", s.condition === "unknown" && "condition"].filter(Boolean) : [];
  return {
    ok: true,
    summary: run.supply ? `offer: ${describeSupply(run.supply)}${missing.length ? ` · missing ${missing.join(", ")}` : ""}${dropped ? ` · ${dropped} event(s) dropped: quote not in the message` : ""}` : "no food offer found in the message",
    data: { offer: run.supply, condition: run.condition, events: kept.map(e => ({ kind: e.kind, item: e.item, quantity: e.quantity, unit: e.unit, quantity_basis: e.quantity_basis, condition: e.condition, deadline_hour: e.deadline_hour, location: e.location, unresolved: e.unresolved, quote: e.quote })), review_reasons: checked.review_reasons, droppedForBadQuote: dropped }
  };
}

async function assessPhoto({ run, deps, image }: ToolContext): Promise<ToolResult> {
  if (!run.hasPhoto || !image) return refuse("no_photo", run.hasPhoto ? "the photo was already handled in an earlier step and is not stored" : "the donor did not send a photo");
  if (run.photo) return refuse("already_done", "the photo was already assessed");
  if (deps.useMeta) {
    run.metaCalls++;
    try {
      const assessment = await deps.assessPhotoWithMeta(image, run.donorTexts[0] ?? "");
      run.photo = { status: "assessed", provider: "Meta Model API", model: deps.visionModelId, assessment, routing: routePhotoAssessment(assessment) };
    } catch (error) {
      run.photo = { status: "failed", provider: "Meta Model API", model: deps.visionModelId, error: error instanceof Error ? error.name : "UnknownError" };
    }
  } else {
    const assessment = deps.photoFixture ? PHOTO_FIXTURES[deps.photoFixture] : assessPhotoLocally();
    run.photo = { status: "assessed", provider: deps.photoFixture ? "Simulated photo fixture (no model call)" : LOCAL_PROVIDER, model: null, assessment, routing: routePhotoAssessment(assessment) };
  }
  run.supplyVersion++;
  refreshCondition(run);
  const p = run.photo;
  return p.status === "failed"
    ? { ok: true, summary: "photo could not be assessed: condition is not trusted until a person inspects", data: { photo: "failed", condition: run.condition } }
    : { ok: true, summary: `photo: ${p.assessment.visual_grade.replaceAll("_", " ")} · suggests ${p.routing.suggestedCondition.replaceAll("_", " ")}`, data: { grade: p.assessment.visual_grade, issues: p.assessment.visible_issues, suggestedCondition: p.routing.suggestedCondition, condition: run.condition } };
}

function findMatches({ run }: ToolContext): ToolResult {
  if (!run.supply) return refuse("no_offer", "there is no offer yet: call extract_event first, or ask the donor what they have");
  run.candidates = (evaluateCandidates(run.supply) as Candidate[]).map(c => ({ recipientId: c.recipientId, recipient: c.recipient, tier: c.tier, capacityId: c.capacityId, capacity: c.capacity, routeKm: c.routeKm ?? null, feasible: c.feasible, blockers: c.blockers }));
  run.candidatesVersion = run.supplyVersion;
  const feasible = run.candidates.filter(c => c.feasible);
  return {
    ok: true,
    summary: `${feasible.length} feasible, ${run.candidates.length - feasible.length} blocked`,
    data: {
      feasible: feasible.map(c => ({ recipientId: c.recipientId, capacityId: c.capacityId, recipient: c.recipient, tier: c.tier, capacity: c.capacity })),
      blocked: run.candidates.filter(c => !c.feasible).slice(0, 6).map(c => ({ recipientId: c.recipientId, capacityId: c.capacityId, recipient: c.recipient, tier: c.tier, blockers: c.blockers.map(b => b.code) }))
    }
  };
}

function askDonor({ run }: ToolContext, field: string, question: string): ToolResult {
  const check = checkQuestion(run, field, question);
  if (!check.passed) return refuse("question_check", check.reason);
  run.asks++;
  run.question = { field, text: question.trim() };
  run.status = "needs_input";
  return { ok: true, summary: `asked the donor about ${field.replaceAll("_", " ")}`, data: { status: "needs_input" } };
}

function askOperator({ run }: ToolContext, reason: string): ToolResult {
  const check = checkHandoff(run, reason);
  if (!check.passed) return refuse("handoff_check", check.reason);
  run.handoff = reason.trim();
  run.status = "escalated";
  return { ok: true, summary: "handed to an operator", data: { status: "escalated" } };
}

async function proposeMatch({ run, deps }: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  const recipientId = String(args.recipientId ?? ""), capacityId = String(args.capacityId ?? ""), rationale = String(args.rationale ?? "").trim();
  const quotes = Array.isArray(args.quotes) ? args.quotes.map(String) : [];
  const rules = checkProposal(run, recipientId, capacityId, rationale, quotes);
  let failed: { check: string; problems: string[] } | null = rules.passed ? null : { check: "proposal_rules", problems: rules.problems };
  let judge: Awaited<ReturnType<Judge>> | null = null;
  if (!failed) {
    // A separate reviewer, outside the planner's control: does the rationale say more than its quotes?
    if (deps.useMeta) run.metaCalls++;
    try { judge = await deps.judge(rationale, quotes, factsFor(run, rules.candidate!)); }
    catch (error) { judge = { by: "reviewer unavailable", supported: false, note: `the claims check failed (${error instanceof Error ? error.name : "error"}), so the proposal can't be verified` }; }
    if (!judge.supported) failed = { check: "claims_check", problems: [judge.note] };
  }
  if (failed) {
    run.refusals++;
    if (run.refusals >= MAX_REFUSALS) {
      run.handoff = `proposal refused ${run.refusals} times. last problems: ${failed.problems.join("; ")}`;
      run.status = "escalated";
      return { ok: false, refused: failed.check, summary: `refused (${failed.check}) · handed to an operator after ${run.refusals} refusals`, data: { status: "escalated", problems: failed.problems } };
    }
    return refuse(failed.check, `proposal refused: ${failed.problems.join("; ")}`, { problems: failed.problems, refusalsLeft: MAX_REFUSALS - run.refusals });
  }
  const c = rules.candidate!;
  run.proposal = { recipientId, capacityId, recipient: c.recipient, capacity: c.capacity, tier: c.tier, routeKm: c.routeKm, rationale, quotes, judge: judge! };
  run.status = "awaiting_approval";
  return { ok: true, summary: `proposal for ${c.recipient} passed every check · waiting for operator sign-off`, data: { status: "awaiting_approval" } };
}

function factsFor(run: AgentRun, c: Candidate): string {
  return JSON.stringify({ offer: run.supply, recipient: c.recipient, tier: c.tier, transport: c.capacity });
}

export function describeSupply(s: Supply): string {
  const qty = s.quantity == null ? "quantity ?" : `${s.quantityBasis === "estimated" ? "~" : ""}${s.quantity}`;
  return [qty, s.item ?? s.category ?? "item ?", s.location ? `at ${s.location}` : "location ?", s.deadlineHour != null ? `by ${s.deadlineHour}:00` : "deadline ?", `condition ${s.condition.replaceAll("_", " ")}`].join(" · ");
}
