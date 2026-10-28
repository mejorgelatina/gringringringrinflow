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
  if (!input || typeof input !== "object") return fail("invalid_input", "La solicitud de interacción no es válida.");
  const required = ["entityId", "reasonCode", "targetRole", "question", "expiresAt"];
  const missing = required.filter((key) => !input[key]);
  if (missing.length) return fail("missing_fields", `Faltan campos: ${missing.join(", ")}.`);
  if (typeof input.question !== "string" || input.question.trim().length < 5 || input.question.length > 500) return fail("invalid_question", "La pregunta debe tener entre 5 y 500 caracteres.");
  const expiry = parseTime(input.expiresAt);
  if (expiry === null || expiry <= now) return fail("invalid_expiry", "La fecha de expiración debe ser futura.");
  if (!Array.isArray(input.allowedResponses) || input.allowedResponses.length < 1 || input.allowedResponses.length > 8) return fail("invalid_responses", "Define entre 1 y 8 respuestas válidas.");
  const ids = input.allowedResponses.map((r) => r?.id);
  if (ids.some((id) => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) return fail("invalid_response_ids", "Cada respuesta necesita un ID único.");
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
  if (!request) return fail("not_found", "Solicitud de interacción no encontrada.");
  if (request.status !== "pending") return fail("not_pending", "La solicitud ya no está pendiente.", request);
  const expiry = parseTime(request.expiresAt);
  if (expiry === null || now >= expiry) return expireInteraction(request, { now });
  if (request.targetActorId && request.targetActorId !== actorId) return fail("wrong_actor", "La solicitud está dirigida a otra persona.", request);
  if (!actorRoles.includes(request.targetRole)) return fail("unauthorized_role", "El rol de la persona no puede responder esta solicitud.", request);
  const selected = request.allowedResponses.find((item) => item.id === responseId);
  if (!selected) return fail("invalid_response", "La respuesta no pertenece a las opciones permitidas.", request);
  if (typeof text !== "string" || text.length > 2000) return fail("invalid_text", "El texto adicional no puede exceder 2,000 caracteres.", request);
  const at = nowIso(now);
  const updated = {
    ...request, status: "answered",
    response: { responseId, label: selected.label, effect: selected.effect, text: text.trim(), actorId, actorRole: request.targetRole, evidenceReference, at },
    events: [{ type: "interaction_answered", at, actor: actorId, responseId, effect: selected.effect }, ...(request.events || [])]
  };
  return { ok: true, request: updated, operationalAction: "none", note: "La respuesta queda registrada; una acción operativa requiere su propio permiso y transición validada." };
}

/** @param {any} request @param {{ now?: number, actor?: string }} [options] */
export function expireInteraction(request, { now = Date.now(), actor = "system" } = {}) {
  if (!request) return fail("not_found", "Solicitud de interacción no encontrada.");
  if (request.status !== "pending") return fail("not_pending", "Solo se pueden expirar solicitudes pendientes.", request);
  const expiry = parseTime(request.expiresAt);
  if (expiry === null || now < expiry) return fail("not_expired", "La fecha límite aún no ha pasado.", request);
  const at = nowIso(now);
  return { ok: true, request: { ...request, status: "expired", expiredAt: at, events: [{ type: "interaction_expired", at, actor }, ...(request.events || [])] }, operationalAction: "none", note: "El silencio no equivale a consentimiento ni aprobación." };
}

/** @param {any} request @param {{ now?: number, actor?: string, reason?: string }} [options] */
export function cancelInteraction(request, { now = Date.now(), actor, reason } = {}) {
  if (!request) return fail("not_found", "Solicitud de interacción no encontrada.");
  if (request.status !== "pending" || TERMINAL.has(request.status)) return fail("not_pending", "Solo se pueden cancelar solicitudes pendientes.", request);
  if (!actor || typeof reason !== "string" || !reason.trim()) return fail("missing_cancellation_context", "La cancelación requiere actor y motivo.", request);
  const at = nowIso(now);
  return { ok: true, request: { ...request, status: "cancelled", cancelledAt: at, cancellationReason: reason.trim().slice(0, 300), events: [{ type: "interaction_cancelled", at, actor, reason: reason.trim().slice(0, 300) }, ...(request.events || [])] }, operationalAction: "none" };
}
