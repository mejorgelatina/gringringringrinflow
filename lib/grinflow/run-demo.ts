import { DEMO_ACTORS, DEMO_ANSWERS, DEMO_DAY, DEMO_DESTINATIONS, DEMO_VEHICLES, demoOffer } from "./demo-data.ts"
import { FlowError } from "./errors.ts"
import { answerInteraction, proposeDestinations, receiveOffer, recordDecision, requestInformation } from "./flow.ts"
import type { Destination, Offer, OfferCase, Vehicle } from "./types.ts"

export type DemoInput = {
  offer?: Offer
  destinations?: Destination[]
  vehicles?: Vehicle[]
  // Donor answers by field. A field without an answer stays open: silence is not consent.
  answers?: Record<string, string>
  decision?: { outcome: "approved" | "rejected"; proposalIndex?: number; reason?: string } | null
}

export type DemoResult = {
  case: OfferCase
  stoppedAt: "needs_information" | "no_feasible_option" | "awaiting_decision" | "decided"
  error: { code: string; message: string } | null
}

// Runs the whole loop once, in memory. Nothing is stored and no message is sent.
export function runDemoFlow(input: DemoInput = {}): DemoResult {
  const at = (hhmm: string) => `${DEMO_DAY}T${hhmm}:00.000Z`
  const answers = input.answers ?? DEMO_ANSWERS
  let c = receiveOffer(input.offer ?? demoOffer(), at("17:00"), DEMO_ACTORS.donor.id)

  try {
    c = requestInformation(c, at("17:01"))
    for (const i of c.interactions) {
      const reply = answers[i.field]
      if (reply !== undefined) c = answerInteraction(c, i.id, DEMO_ACTORS.donor, reply, at("17:05"))
    }
    // A "no" to a confirmation opens a new clarifying question; one more round if it was answered too.
    c = requestInformation(c, at("17:06"))
    if (c.state === "needs_information") return { case: c, stoppedAt: "needs_information", error: null }

    c = proposeDestinations(c, input.destinations ?? DEMO_DESTINATIONS, input.vehicles ?? DEMO_VEHICLES, at("17:10"))
    if (c.state === "no_feasible_option") return { case: c, stoppedAt: "no_feasible_option", error: null }
    if (!input.decision) return { case: c, stoppedAt: "awaiting_decision", error: null }

    const proposal = c.proposals[input.decision.proposalIndex ?? 0]
    c = recordDecision(
      c,
      DEMO_ACTORS.operator,
      { outcome: input.decision.outcome, proposalId: proposal?.id ?? null, reason: input.decision.reason ?? null },
      at("17:12"),
    )
    return { case: c, stoppedAt: "decided", error: null }
  } catch (e) {
    if (e instanceof FlowError) {
      const stoppedAt = c.state === "proposed" ? "awaiting_decision" : "needs_information"
      return { case: c, stoppedAt, error: { code: e.code, message: e.message } }
    }
    throw e
  }
}
