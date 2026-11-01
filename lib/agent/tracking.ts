import type { AgentRun } from "./types.ts";

/**
 * A collection seen the way a parcel is: one tracking number, the stages it has passed and
 * the ones ahead, what was checked at each, and estimated pickup and delivery times.
 * Pure: derived from the run alone, so the operator console and the public page agree.
 */

export type StageState = "done" | "current" | "waiting" | "blocked" | "pending";
export type Stage = { key: string; label: string; state: StageState; at: string | null; detail: string; checks: string[] };
export type Eta = { pickup: string; delivery: string; late: boolean; basis: string };
export type Tracking = { code: string; headline: string; tone: "ok" | "review" | "blocked"; createdAt: string; stages: Stage[]; eta: Eta | null; etaFinal: boolean };

/** GF- plus 8 characters of the run id: short enough to read over the phone. */
export function trackingCode(id: string): string {
  return `GF-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export const DISPATCH_MINUTES = 20;
export const LOADING_MINUTES = 10;
export const CITY_KMH = 18;

const TZ = "America/Mexico_City";
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const hourIn = (iso: string) => Number(new Date(iso).toLocaleString("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: TZ }));

/**
 * Pickup = sign-off + dispatch time; delivery = pickup + loading + route at a city average speed.
 * Before sign-off the same estimate assumes approval now, and says so.
 */
export function estimate(run: AgentRun, nowIso: string): Eta | null {
  const p = run.proposal;
  if (!p || p.routeKm == null) return null;
  const from = run.status === "approved" && run.review ? run.review.at : nowIso;
  const pickup = new Date(Date.parse(from) + DISPATCH_MINUTES * 60_000).toISOString();
  const delivery = new Date(Date.parse(pickup) + (LOADING_MINUTES + (p.routeKm / CITY_KMH) * 60) * 60_000).toISOString();
  const deadline = run.supply?.deadlineHour;
  const late = deadline != null && hourIn(pickup) >= deadline;
  return { pickup: clock(pickup), delivery: clock(delivery), late, basis: `estimate · ${p.routeKm} km synthetic route at ${CITY_KMH} km/h + ${DISPATCH_MINUTES} min dispatch + ${LOADING_MINUTES} min loading · not live routing` };
}

const lastAt = (run: AgentRun, tool: string) => [...run.turns].reverse().find(t => t.tool === tool)?.at ?? null;

export function trackingView(run: AgentRun, nowIso = new Date().toISOString()): Tracking {
  const s = run.supply, c = run.condition, p = run.proposal;
  const createdAt = run.createdAt ?? run.turns[0]?.at ?? nowIso;
  const missing = s ? [s.quantity == null || s.quantityBasis === "estimated" ? "quantity" : null, !s.location ? "pickup place" : null, s.deadlineHour == null ? "pickup time" : null, !s.category ? "product" : null].filter(Boolean) as string[] : [];
  const waitingDonor = run.status === "needs_input";
  const waitingOperator = run.status === "escalated";
  const feasible = run.candidates && run.candidatesVersion === run.supplyVersion ? run.candidates.filter(x => x.feasible) : null;
  const approved = run.status === "approved";

  const stages: Stage[] = [];
  stages.push({ key: "received", label: "message received", state: "done", at: createdAt, detail: run.donorTexts.length > 1 ? `${run.donorTexts.length} messages from the donor` : "from the donor", checks: [] });

  stages.push({
    key: "understood", label: "offer understood",
    state: s ? "done" : waitingDonor ? "waiting" : run.extractedTexts ? "blocked" : "current",
    at: s ? lastAt(run, "extract_event") : null,
    detail: s ? [s.quantity != null ? `${s.quantityBasis === "estimated" ? "about " : ""}${s.quantity}` : null, s.category, s.location ? `at ${s.location}` : null, s.deadlineHour != null ? `by ${s.deadlineHour}:00` : null].filter(Boolean).join(" · ") : waitingDonor ? `waiting for the donor: ${run.question?.text ?? ""}` : "no food offer found yet",
    checks: s ? ["every fact traced to the donor's own words"] : []
  });

  stages.push({
    key: "details", label: "details confirmed",
    state: !s ? "pending" : missing.length === 0 ? "done" : waitingDonor ? "waiting" : "current",
    at: !s || missing.length ? null : lastAt(run, "extract_event"),
    detail: !s ? "" : missing.length === 0 ? (s.quantityBasis === "confirmed" ? "quantity confirmed by a person" : "quantity, place and time stated by the donor") : waitingDonor ? `waiting for the donor: ${run.question?.text ?? ""}` : `missing: ${missing.join(", ")}`,
    checks: run.asks ? [`${run.asks} question(s) to the donor`] : []
  });

  const photoNote = run.photo ? (run.photo.status === "failed" ? "photo could not be read" : `photo: ${run.photo.assessment.visual_grade.replaceAll("_", " ")}`) : null;
  const conditionKnown = c && c.effective !== "unknown";
  stages.push({
    key: "condition", label: "condition checked",
    state: !s ? "pending" : c?.humanConfirmed || (conditionKnown && !c?.peopleRouteBlocked) ? "done" : waitingOperator && !p ? "waiting" : conditionKnown ? "done" : waitingDonor ? "waiting" : "current",
    at: c?.humanConfirmed?.at ?? null,
    detail: !c ? "" : c.humanConfirmed ? `inspected by ${c.humanConfirmed.reviewer}: ${c.humanConfirmed.condition.replaceAll("_", " ")}` : waitingOperator ? "waiting for a person to inspect" : `${c.effective === "edible" ? "fit for people" : c.effective.replaceAll("_", " ")} · ${c.reason.toLocaleLowerCase()}`,
    checks: [photoNote, c?.stated && c.stated !== "unknown" ? `donor said: ${c.stated.replaceAll("_", " ")}` : null, run.hasPhoto ? "a photo can never certify food as safe" : null].filter(Boolean) as string[]
  });

  stages.push({
    key: "matched", label: "recipient and vehicle found",
    state: p ? "done" : feasible == null ? "pending" : feasible.length ? "current" : waitingDonor || waitingOperator ? "waiting" : "blocked",
    at: p ? lastAt(run, "find_matches") : null,
    detail: p ? `${p.recipient} · ${p.capacity}` : feasible == null ? "" : feasible.length ? `${feasible.length} feasible option(s)` : `blocked: ${[...new Set((run.candidates ?? []).filter(x => x.tier === "people").flatMap(x => x.blockers.map(b => b.label.toLocaleLowerCase())))].slice(0, 3).join("; ")}`,
    checks: feasible != null ? ["hard constraints from the matching engine; no score overrides them"] : []
  });

  stages.push({
    key: "verified", label: "proposal verified",
    state: p ? "done" : run.refusals ? (waitingOperator ? "waiting" : "current") : "pending",
    at: p ? lastAt(run, "propose_match") : null,
    detail: p ? p.judge.note : run.refusals ? `${run.refusals} proposal(s) refused by the checks${waitingOperator ? "; a person is reviewing" : ""}` : "",
    checks: p ? ["quotes match the donor's words", "pair still feasible when re-checked", `claims check · ${p.judge.by}`] : []
  });

  stages.push({
    key: "approved", label: "operator sign-off",
    state: approved ? "done" : run.status === "awaiting_approval" ? "waiting" : "pending",
    at: approved ? run.review?.at ?? null : null,
    detail: approved ? `approved by ${run.review?.reviewer}` : run.status === "awaiting_approval" ? "waiting for an operator to approve" : run.review?.decision === "rejected" ? `last proposal rejected by ${run.review.reviewer}${run.review.notes ? `: ${run.review.notes}` : ""}` : "",
    checks: []
  });

  const eta = estimate(run, nowIso);
  const op = run.operation;
  const opDetail = op ? ` · ${op.mode === "pickup" ? `receiver collects, free · code ${op.handoffCode}` : op.mode === "own_courier" ? `receiver sends its own courier (uber) and pays it · code ${op.handoffCode}` : `${op.mode} $${op.costMxn} mxn, paid by the receiver once accepted`}` : "";
  stages.push({ key: "pickup", label: "pickup", state: approved ? "current" : "pending", at: null, detail: eta ? `${approved ? "estimated" : "if approved now, about"} ${eta.pickup}${eta.late ? " · after the donor's deadline" : ""}${opDetail} · simulated` : "", checks: [] });
  stages.push({ key: "delivered", label: "delivered", state: "pending", at: null, detail: eta && p ? `${approved ? "estimated" : "if approved now, about"} ${eta.delivery} at ${p.recipient} · simulated` : "", checks: [] });

  const headline =
    approved ? `pickup scheduled · eta ${eta?.pickup ?? "pending"}` :
    run.status === "awaiting_approval" ? "verified · waiting for sign-off" :
    waitingDonor ? "waiting for the donor" :
    waitingOperator ? "with an operator" :
    run.status === "paused" ? "paused" : "in progress";
  const tone = approved || run.status === "awaiting_approval" ? "ok" : waitingOperator || run.status === "paused" ? "blocked" : "review";
  return { code: run.code ?? trackingCode(run.id), headline, tone, createdAt, stages, eta, etaFinal: approved };
}
