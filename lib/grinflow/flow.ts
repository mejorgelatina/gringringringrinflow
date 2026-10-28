import { FlowError } from "./errors.ts"
import { identifyGaps, type Gap } from "./gaps.ts"
import { answerInteraction as answer, cancelInteraction as cancel, createInteraction, expireInteraction } from "./interactions.ts"
import { rankProposals } from "./match.ts"
import type {
  Actor,
  Condition,
  Destination,
  FlowEvent,
  Interaction,
  Offer,
  OfferCase,
  OfferFieldName,
  TrackedField,
  Vehicle,
} from "./types.ts"

// The coordination loop as pure functions over an OfferCase.
// Every function returns a new case and appends to an event log that is never rewritten.

function log(c: OfferCase, at: string, type: string, actorId: string | null, detail: Record<string, unknown>): FlowEvent[] {
  return [...c.events, { seq: c.events.length + 1, at, type, actorId, detail }]
}

function stateFromGaps(c: OfferCase): OfferCase["state"] {
  return identifyGaps(c.offer).length > 0 ? "needs_information" : "ready_to_match"
}

function assertOpen(c: OfferCase) {
  if (c.state === "approved" || c.state === "rejected") {
    throw new FlowError("case_closed", `La operación ya tiene una decisión: ${c.state}.`)
  }
}

export function receiveOffer(offer: Offer, now: string, actorId: string | null = null): OfferCase {
  const base: OfferCase = { offer, state: "received", interactions: [], proposals: [], decision: null, events: [] }
  const gaps = identifyGaps(offer)
  const events = log(base, now, "offer_received", actorId, {
    rawMessage: offer.rawMessage,
    gaps: gaps.map((g) => ({ field: g.field, kind: g.kind })),
  })
  return { ...base, events, state: gaps.length > 0 ? "needs_information" : "ready_to_match" }
}

export function currentGaps(c: OfferCase): Gap[] {
  return identifyGaps(c.offer)
}

// Open one request per gap that does not already have an open request.
export function requestInformation(c: OfferCase, now: string, ttlMinutes = 60): OfferCase {
  assertOpen(c)
  const pending = identifyGaps(c.offer).filter(
    (g) => !c.interactions.some((i) => i.state === "open" && i.field === g.field && i.kind === g.kind),
  )
  let next = c
  for (const gap of pending) {
    const interaction = createInteraction({
      id: `${c.offer.id}-q${next.interactions.length + 1}`,
      offerId: c.offer.id,
      gap,
      targetActorId: gap.targetRole === "donor" ? c.offer.donorId : null,
      now,
      ttlMinutes,
    })
    next = {
      ...next,
      interactions: [...next.interactions, interaction],
      events: log(next, now, "interaction_requested", null, {
        interactionId: interaction.id,
        field: gap.field,
        kind: gap.kind,
        targetRole: gap.targetRole,
        question: gap.question,
        expiresAt: interaction.expiresAt,
      }),
    }
  }
  return next
}

function dayOf(iso: string): string {
  return iso.slice(0, 10)
}

// Turn a donor's free answer into a typed value. Throws before anything is recorded if it cannot be read.
function parseValue(field: OfferFieldName, raw: string, now: string): unknown {
  const text = raw.trim()
  switch (field) {
    case "quantity":
    case "weightKg": {
      const n = Number(text.replace(",", "."))
      if (!Number.isFinite(n) || n <= 0) throw new FlowError("invalid_answer", `"${raw}" no es un número válido.`)
      return n
    }
    case "condition":
      return text as Condition
    case "pickupWindow": {
      const m = text.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/)
      if (!m) throw new FlowError("invalid_answer", "Usa el formato HH:MM-HH:MM.")
      const pad = (s: string) => s.padStart(2, "0")
      const start = `${dayOf(now)}T${pad(m[1])}:${m[2]}:00.000Z`
      const end = `${dayOf(now)}T${pad(m[3])}:${m[4]}:00.000Z`
      if (Date.parse(start) >= Date.parse(end)) throw new FlowError("invalid_answer", "El horario termina antes de empezar.")
      return { start, end }
    }
    case "pickupLocation": {
      const parts = text.split(",").map((p) => Number(p.trim()))
      if (parts.length !== 2 || parts.some((p) => !Number.isFinite(p))) throw new FlowError("invalid_answer", "Usa el formato lat,lng.")
      return { lat: parts[0], lng: parts[1] }
    }
    default:
      return text
  }
}

export function answerInteraction(c: OfferCase, interactionId: string, actor: Actor, rawAnswer: string, now: string): OfferCase {
  assertOpen(c)
  const index = c.interactions.findIndex((i) => i.id === interactionId)
  if (index === -1) throw new FlowError("interaction_not_found", `No existe la solicitud ${interactionId}.`)
  const original = c.interactions[index]

  const updated = answer(original, actor, rawAnswer, now)
  const field = updated.field
  const before = c.offer[field] as TrackedField<unknown>
  let after: TrackedField<unknown>

  if (updated.kind === "confirm") {
    after = updated.answer === "si"
      ? { value: before.value, status: "confirmed", source: `interaction:${updated.id}` }
      : { value: null, status: "missing", source: `interaction:${updated.id}` }
  } else {
    after = { value: parseValue(field, updated.answer ?? "", now), status: "confirmed", source: `interaction:${updated.id}` }
  }

  const interactions = c.interactions.map((i, n) => (n === index ? updated : i))
  const offer = { ...c.offer, [field]: after } as Offer
  let events = log(c, now, "interaction_answered", actor.id, { interactionId: updated.id, field, answer: updated.answer })
  events = log({ ...c, events }, now, after.status === "confirmed" ? "field_confirmed" : "field_rejected", actor.id, {
    field,
    before: { value: before.value, status: before.status },
    after: { value: after.value, status: after.status },
  })

  // A changed offer invalidates any earlier proposals.
  const next: OfferCase = { ...c, offer, interactions, events, proposals: [] }
  return { ...next, state: stateFromGaps(next) }
}

// Silence is not consent: expired requests leave the data unconfirmed.
export function expireInteractions(c: OfferCase, now: string): OfferCase {
  let events = c.events
  const interactions = c.interactions.map((i) => {
    const after = expireInteraction(i, now)
    if (after !== i) events = log({ ...c, events }, now, "interaction_expired", null, { interactionId: i.id, field: i.field })
    return after
  })
  return { ...c, interactions, events }
}

export function cancelInteraction(c: OfferCase, interactionId: string, actor: Actor, reason: string, now: string): OfferCase {
  const index = c.interactions.findIndex((i) => i.id === interactionId)
  if (index === -1) throw new FlowError("interaction_not_found", `No existe la solicitud ${interactionId}.`)
  const updated: Interaction = cancel(c.interactions[index], actor, reason, now)
  return {
    ...c,
    interactions: c.interactions.map((i, n) => (n === index ? updated : i)),
    events: log(c, now, "interaction_cancelled", actor.id, { interactionId, reason }),
  }
}

export function proposeDestinations(c: OfferCase, destinations: Destination[], vehicles: Vehicle[], now: string): OfferCase {
  assertOpen(c)
  const gaps = identifyGaps(c.offer)
  if (gaps.length > 0) {
    throw new FlowError("missing_information", `Faltan datos antes de proponer destinos: ${gaps.map((g) => g.field).join(", ")}.`)
  }
  const proposals = rankProposals(c.offer, destinations, vehicles)
  const feasible = proposals.filter((p) => p.feasible)
  return {
    ...c,
    proposals,
    state: feasible.length > 0 ? "proposed" : "no_feasible_option",
    events: log(c, now, "proposals_generated", null, {
      evaluated: proposals.length,
      feasible: feasible.length,
      top: feasible.slice(0, 3).map((p) => ({ id: p.id, score: p.score })),
    }),
  }
}

// The only step that commits to an option, and only an operator can take it.
// Approval places a hold on the supply; it is not an executed pickup or a verified outcome.
export function recordDecision(
  c: OfferCase,
  actor: Actor,
  decision: { outcome: "approved" | "rejected"; proposalId?: string | null; reason?: string | null },
  now: string,
): OfferCase {
  assertOpen(c)
  if (actor.role !== "operator") {
    throw new FlowError("not_authorized", "Solo una persona operadora puede aprobar o rechazar.")
  }
  const reason = decision.reason?.trim() || null
  let proposalId: string | null = null

  if (decision.outcome === "approved") {
    if (c.state !== "proposed") throw new FlowError("nothing_to_approve", "No hay propuestas viables para aprobar.")
    const proposal = c.proposals.find((p) => p.id === decision.proposalId)
    if (!proposal) throw new FlowError("proposal_not_found", "Elige una de las propuestas generadas.")
    if (!proposal.feasible) throw new FlowError("proposal_blocked", `La propuesta está bloqueada: ${proposal.blocks.map((b) => b.code).join(", ")}.`)
    proposalId = proposal.id
  } else {
    if (!reason) throw new FlowError("reason_required", "Un rechazo debe llevar un motivo.")
    proposalId = decision.proposalId ?? null
  }

  return {
    ...c,
    state: decision.outcome,
    decision: { outcome: decision.outcome, proposalId, decidedBy: actor.id, decidedAt: now, reason },
    events: log(c, now, "decision_recorded", actor.id, {
      outcome: decision.outcome,
      proposalId,
      reason,
      note: decision.outcome === "approved" ? "Reserva el producto; la recogida y la entrega se registran aparte." : null,
    }),
  }
}
