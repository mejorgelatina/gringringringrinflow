import { cancelInteraction as cancelRequest, createInteractionRequest, expireInteraction as expireRequest, respondToInteraction } from "../engines/interactions.mjs"
import { FlowError } from "./errors.ts"
import type { Gap } from "./gaps.ts"
import type { Actor, Interaction } from "./types.ts"

// Adapter over the v0.10 Human Interaction Layer (lib/engines/interactions.mjs).
// The engine records answers and never turns them into approval; silence is never consent.

type EngineResult = { ok: boolean; code?: string; message?: string; request?: unknown }

function unwrap(result: EngineResult, base: Interaction | null): Interaction {
  if (!result.ok) throw new FlowError(result.code ?? "interaction_failed", result.message ?? "La solicitud no se pudo procesar.")
  const request = result.request as Omit<Interaction, "field" | "kind">
  // The engine spreads the request it receives, so field/kind survive updates; on creation we add them.
  return base ? { ...base, ...request } : (request as Interaction)
}

export function openInteraction(params: { id: string; offerId: string; gap: Gap; targetActorId: string | null; now: string; ttlMinutes: number }): Interaction {
  const { id, offerId, gap, targetActorId, now, ttlMinutes } = params
  const at = Date.parse(now)
  const created = unwrap(
    createInteractionRequest(
      {
        entityId: offerId,
        reasonCode: `${gap.kind}:${gap.field}`,
        targetRole: gap.targetRole,
        targetActorId,
        question: gap.question,
        expiresAt: at + ttlMinutes * 60_000,
        allowedResponses: gap.allowedResponses,
        createdBy: "grinflow_flow",
      },
      { now: at, id },
    ),
    null,
  )
  return { ...created, field: gap.field, kind: gap.kind }
}

export function isExpired(interaction: Interaction, now: string): boolean {
  return Date.parse(now) >= Date.parse(interaction.expiresAt)
}

export function answerInteraction(interaction: Interaction, actor: Actor, responseId: string, text: string, now: string): Interaction {
  // The engine would turn a late answer into an expiry; the flow records expiries in its own sweep instead.
  if (interaction.status === "pending" && isExpired(interaction, now)) {
    throw new FlowError("interaction_expired", `La solicitud venció a las ${interaction.expiresAt.slice(11, 16)}.`)
  }
  return unwrap(respondToInteraction(interaction, { responseId, actorId: actor.id, actorRoles: [actor.role], text, now: Date.parse(now) }), interaction)
}

export function expireInteraction(interaction: Interaction, now: string): Interaction {
  if (interaction.status !== "pending" || !isExpired(interaction, now)) return interaction
  return unwrap(expireRequest(interaction, { now: Date.parse(now) }), interaction)
}

export function cancelInteraction(interaction: Interaction, actor: Actor, reason: string, now: string): Interaction {
  return unwrap(cancelRequest(interaction, { now: Date.parse(now), actor: actor.id, reason }), interaction)
}
