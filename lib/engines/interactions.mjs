/** Human Interaction Layer core. Responses are recorded, never silently converted into operational approval. */
const TERMINAL = new Set(["answered", "expired", "cancelled"]);
const nowIso = (now) => new Date(now).toISOString();
const parseTime = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") { const n = Date.parse(value); return Number.isFinite(n) ? n : null; }
  return null;
};
const fail = (code, message, request = null) => ({ ok: false, code, message, request });

/** @param {any} input @param {{ now?: number, id?: string }} [options] */
export function createInteractionRequest(input, { now = Date.now(), id = `interaction-${now}` } = {}) {
  if (!input || typeof input !== "object") return fail("invalid_input", "The interaction request is invalid.");
  const required = ["entityId", "reasonCode", "targetRole", "question", "expiresAt"];
  const missing = required.filter((key) => !input[key]);
  if (missing.length) return fail("missing_fields", `Faltan campos: ${missing.join(", ")}.`);
  if (typeof input.question !== "string" || input.question.trim().length < 5 || input.question.length > 500) return fail("invalid_question", "Question must be between 5 and 500 characters.");
  const expiry = parseTime(input.expiresAt);
  if (expiry === null || expiry <= now) return fail("invalid_expiry", "Expiry must be in the future.");
  if (!Array.isArray(input.allowedResponses) || input.allowedResponses.length < 1 || input.allowedResponses.length > 8) return fail("invalid_responses", "Define between 1 and 8 valid responses.");
  const ids = input.allowedResponses.map((r) => r?.id);
  if (ids.some((id) => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) return fail("invalid_response_ids", "Each response needs a unique ID.");
  const request = {
    id, entityId: input.entityId, reasonCode: input.reasonCode, targetRole: input.targetRole,
    targetActorId: input.targetActorId || null, channel: input.channel || "web_demo",
    question: input.question.trim(), allowedResponses: input.allowedResponses.map((r) => ({ id: r.id, label: String(r.label || r.id).slice(0, 120), effect: r.effect || "provide_information" })),
    expiresAt: new Date(expiry).toISOString(), status: "pending", createdAt: nowIso(now),
    createdBy: input.createdBy || "system_demo", response: null, events: [{ type: "interaction_created", at: nowIso(now), actor: input.createdBy || "system_demo" }]
  };
  return { ok: true, request };
}

/** @param {any} request @param {{ responseId?: string, actorId?: string, actorRoles?: string[], text?: string, now?: number, evidenceReference?: string | null }} [options] */
export function respondToInteraction(request, { responseId, actorId, actorRoles = [], text = "", now = Date.now(), evidenceReference = null } = {}) {
  if (!request) return fail("not_found", "Interaction request not found.");
  if (request.status !== "pending") return fail("not_pending", "The request is no longer pending.", request);
  const expiry = parseTime(request.expiresAt);
  if (expiry === null || now >= expiry) return expireInteraction(request, { now });
  if (request.targetActorId && request.targetActorId !== actorId) return fail("wrong_actor", "The request is addressed to another person.", request);
  if (!actorRoles.includes(request.targetRole)) return fail("unauthorized_role", "This role is not authorized to answer the request.", request);
  const selected = request.allowedResponses.find((item) => item.id === responseId);
  if (!selected) return fail("invalid_response", "The response is not one of the allowed options.", request);
  if (typeof text !== "string" || text.length > 2000) return fail("invalid_text", "Additional text cannot exceed 2,000 characters.", request);
  const at = nowIso(now);
  const updated = {
    ...request, status: "answered",
    response: { responseId, label: selected.label, effect: selected.effect, text: text.trim(), actorId, actorRole: request.targetRole, evidenceReference, at },
    events: [{ type: "interaction_answered", at, actor: actorId, responseId, effect: selected.effect }, ...(request.events || [])]
  };
  return { ok: true, request: updated, operationalAction: "none", note: "The response is recorded; an operational action requires its own authorization and validated transition." };
}

/** @param {any} request @param {{ now?: number, actor?: string }} [options] */
export function expireInteraction(request, { now = Date.now(), actor = "system" } = {}) {
  if (!request) return fail("not_found", "Interaction request not found.");
  if (request.status !== "pending") return fail("not_pending", "Solo se pueden expirar solicitudes pendientes.", request);
  const expiry = parseTime(request.expiresAt);
  if (expiry === null || now < expiry) return fail("not_expired", "The deadline has not passed yet.", request);
  const at = nowIso(now);
  return { ok: true, request: { ...request, status: "expired", expiredAt: at, events: [{ type: "interaction_expired", at, actor }, ...(request.events || [])] }, operationalAction: "none", note: "Silence does not mean consent or approval." };
}

/** @param {any} request @param {{ now?: number, actor?: string, reason?: string }} [options] */
export function cancelInteraction(request, { now = Date.now(), actor, reason } = {}) {
  if (!request) return fail("not_found", "Interaction request not found.");
  if (request.status !== "pending" || TERMINAL.has(request.status)) return fail("not_pending", "Solo se pueden cancelar solicitudes pendientes.", request);
  if (!actor || typeof reason !== "string" || !reason.trim()) return fail("missing_cancellation_context", "Cancellation requires an actor and a reason.", request);
  const at = nowIso(now);
  return { ok: true, request: { ...request, status: "cancelled", cancelledAt: at, cancellationReason: reason.trim().slice(0, 300), events: [{ type: "interaction_cancelled", at, actor, reason: reason.trim().slice(0, 300) }, ...(request.events || [])] }, operationalAction: "none" };
}
