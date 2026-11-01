import { evaluateSupply, TIER_ORDER, type LegacyTier } from "../network/supply.ts";
import type { AgentRun, Candidate } from "./types.ts";

/**
 * The checks the planner cannot skip. They run inside the tools, in code, at the moment the
 * agent tries to move forward: ask the donor, hand off, or propose. None of them calls a model.
 */

export const MAX_ASKS = 2;

type Check = { passed: true } | { passed: false; reason: string };
const fail = (reason: string): Check => ({ passed: false, reason });

function photoFlagged(run: AgentRun): boolean {
  const observed = run.condition?.observed;
  return !run.condition?.humanConfirmed && (observed === "past_prime" || observed === "inedible" || observed === "assessment_failed");
}

/** A question to the donor must be about something that is actually missing or uncertain. */
export function checkQuestion(run: AgentRun, field: string, question: string): Check {
  if (!question.trim() || question.length > 300) return fail("write one short question (up to 300 characters)");
  if (run.extractedTexts === 0) return fail("read the message first: call extract_event");
  if (run.asks >= MAX_ASKS) return fail(`the donor was already asked ${run.asks} times; propose with what you have or call ask_operator`);
  const s = run.supply;
  if (field === "offer") return s ? fail("there is already an offer; ask about a specific field") : { passed: true };
  if (!s) return fail("there is no offer yet; ask about the offer itself (field \"offer\")");
  const w = run.icc?.physical.weightKg;
  const uncertain: Record<string, boolean> = {
    quantity: s.quantity == null || s.quantityBasis === "estimated",
    // asking for the weight is fine until someone declared, measured or verified it
    weight: !w || w.provenance === "estimado",
    storage: !!run.icc?.missing.some(m => m.field === "storage"),
    deadline_hour: s.deadlineHour == null,
    location: !s.location,
    category: !s.category,
    condition: s.condition === "unknown" && !photoFlagged(run)
  };
  if (field === "condition" && photoFlagged(run)) return fail("the photo raised a doubt about condition; only a person's inspection can settle it, so call ask_operator");
  if (!(field in uncertain)) return fail(`unknown field: ${field}`);
  return uncertain[field] ? { passed: true } : fail(`${field.replaceAll("_", " ")} is already known; don't ask the donor again`);
}

/** Handing off to a person is for what the donor can't fix, after the engine has had its say. */
export function checkHandoff(run: AgentRun, reason: string): Check {
  if (!reason.trim()) return fail("say why a person is needed");
  if (photoFlagged(run)) return { passed: true };
  if (!run.candidates || run.candidatesVersion !== run.supplyVersion) return fail("run find_matches on the current offer first");
  if (run.candidates.some(c => c.feasible)) return fail("there is a feasible pair: propose it, and the operator will see it at sign-off");
  return { passed: true };
}

/** Code rules for a proposal. The claims check (a separate model call) runs only after these pass. */
export function checkProposal(run: AgentRun, recipientId: string, capacityId: string, rationale: string, quotes: string[]): { passed: boolean; problems: string[]; candidate: Candidate | null } {
  const problems: string[] = [];
  if (!run.supply) return { passed: false, problems: ["there is no offer to propose"], candidate: null };
  if (!run.candidates || run.candidatesVersion !== run.supplyVersion) return { passed: false, problems: ["the offer changed since the last find_matches: run it again"], candidate: null };
  const listed = run.candidates.find(c => c.recipientId === recipientId && c.capacityId === capacityId);
  if (!listed) return { passed: false, problems: [`${recipientId} + ${capacityId} is not a pair from find_matches`], candidate: null };
  if (run.rejectedPairs.includes(`${recipientId}+${capacityId}`)) problems.push("the operator already rejected this pair; read their notes and choose another, or call ask_operator");
  // Re-run the engine here rather than trusting the stored result.
  const now = evaluateSupply(run.supply, run.donorTexts.join("\n")).find(c => c.recipientId === recipientId && c.capacityId === capacityId);
  if (!now?.feasible) problems.push(`${listed.recipient} is blocked: ${(now ?? listed).blockers.map(b => b.label.toLocaleLowerCase()).join("; ")}`);
  // The cascade is a rule, not a preference: a lower route is refused while a higher one is feasible now.
  const higher = evaluateSupply(run.supply, run.donorTexts.join("\n")).find(c => c.feasible && TIER_ORDER.indexOf(c.tier) < TIER_ORDER.indexOf(listed.tier as LegacyTier) && !run.rejectedPairs.includes(`${c.recipientId}+${c.capacityId}`));
  if (higher) problems.push(`${higher.recipient} (${higher.tier}) is feasible: food for people comes before transformation, and transformation before compost`);
  if (listed.tier === "people" && run.condition?.effective !== "edible") problems.push("food for people needs a condition stated by the donor or confirmed by a person, with no doubt from the photo");
  // Never invent a weight: a kilo figure must be the ICC weight, and an estimate must say it is one.
  const kgSaid = [...rationale.matchAll(/(~|aprox\.?\s*|about\s*)?(\d+(?:[.,]\d+)?)(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?\s*kg\b/gi)];
  const w = run.icc?.physical.weightKg;
  if (kgSaid.length && !w) problems.push("the weight is unknown: don't state kilos, ask the donor for the weight");
  else if (w && w.provenance === "estimado" && kgSaid.some(m => !m[1]) && !/estimad|aprox|estimated|approx/i.test(rationale)) problems.push("the weight is an estimate (ICC: estimado): mark it as approximate, e.g. ~40 kg estimado");
  if (rationale.length < 10 || rationale.length > 400) problems.push("the rationale must be one or two sentences (10 to 400 characters)");
  if (!quotes.length || quotes.length > 3) problems.push("cite 1 to 3 quotes from the donor");
  const said = run.donorTexts.join("\n");
  for (const q of quotes) if (q.trim().length < 4 || !said.includes(q)) problems.push(`quote not found in what the donor wrote: "${q.slice(0, 60)}"`);
  return { passed: problems.length === 0, problems, candidate: listed };
}
