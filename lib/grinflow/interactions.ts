import { FlowError } from "./errors.ts"
import type { Gap } from "./gaps.ts"
import type { Actor, Interaction } from "./types.ts"

// Human Interaction Layer: a request addressed to a role, with a question, allowed answers and an expiry.
// An answer is recorded; it never approves an operation by itself. Silence is never consent.

export function createInteraction(params: {
  id: string
  offerId: string
  gap: Gap
  targetActorId: string | null
  now: string
  ttlMinutes: number
}): Interaction {
  const { id, offerId, gap, targetActorId, now, ttlMinutes } = params
  return {
    id,
    offerId,
    field: gap.field,
    kind: gap.kind,
    targetRole: gap.targetRole,
    targetActorId,
    question: gap.question,
    allowedAnswers: gap.allowedAnswers,
    createdAt: now,
    expiresAt: new Date(Date.parse(now) + ttlMinutes * 60_000).toISOString(),
    state: "open",
    answer: null,
    answeredBy: null,
    answeredAt: null,
    history: [{ at: now, state: "open", by: null, note: null }],
  }
}

export function isExpired(interaction: Interaction, now: string): boolean {
  return Date.parse(now) >= Date.parse(interaction.expiresAt)
}

export function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}

export function answerInteraction(interaction: Interaction, actor: Actor, answer: string, now: string): Interaction {
  if (interaction.state !== "open") {
    throw new FlowError("interaction_closed", `La solicitud ${interaction.id} está ${interaction.state}.`)
  }
  if (isExpired(interaction, now)) {
    throw new FlowError("interaction_expired", `La solicitud ${interaction.id} venció a las ${interaction.expiresAt}.`)
  }
  if (actor.role !== interaction.targetRole) {
    throw new FlowError("wrong_role", `La solicitud está dirigida a ${interaction.targetRole}, no a ${actor.role}.`)
  }
  if (interaction.targetActorId && interaction.targetActorId !== actor.id) {
    throw new FlowError("wrong_actor", "La solicitud está dirigida a otra persona.")
  }
  const normalized = normalizeAnswer(answer)
  if (normalized === "") {
    throw new FlowError("empty_answer", "La respuesta está vacía.")
  }
  if (interaction.allowedAnswers && !interaction.allowedAnswers.includes(normalized)) {
    throw new FlowError("answer_not_allowed", `Respuestas permitidas: ${interaction.allowedAnswers.join(", ")}.`)
  }
  return {
    ...interaction,
    state: "answered",
    answer: interaction.allowedAnswers ? normalized : answer.trim(),
    answeredBy: actor.id,
    answeredAt: now,
    history: [...interaction.history, { at: now, state: "answered", by: actor.id, note: null }],
  }
}

export function expireInteraction(interaction: Interaction, now: string): Interaction {
  if (interaction.state !== "open" || !isExpired(interaction, now)) return interaction
  return {
    ...interaction,
    state: "expired",
    history: [...interaction.history, { at: now, state: "expired", by: null, note: "Sin respuesta: el dato sigue sin confirmar." }],
  }
}

export function cancelInteraction(interaction: Interaction, actor: Actor, reason: string, now: string): Interaction {
  if (interaction.state !== "open") {
    throw new FlowError("interaction_closed", `La solicitud ${interaction.id} está ${interaction.state}.`)
  }
  return {
    ...interaction,
    state: "cancelled",
    history: [...interaction.history, { at: now, state: "cancelled", by: actor.id, note: reason }],
  }
}
