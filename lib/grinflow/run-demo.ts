import { DEMO_ACTORS, DEMO_ANSWERS, DEMO_DAY, DEMO_DESTINATIONS, DEMO_VEHICLES, demoOffer } from "./demo-data.ts"
import { FlowError } from "./errors.ts"
import { answerInteraction, proposeDestinations, receiveOffer, recordDecision, requestInformation, reviewRoute } from "./flow.ts"
import { onlyNeedsRouteReview } from "./match.ts"
import type { Destination, Interaction, Offer, OfferCase, Vehicle } from "./types.ts"

export type DemoInput = {
  offer?: Offer
  destinations?: Destination[]
  vehicles?: Vehicle[]
  // Donor answers by field: a response id offered by the request (e.g. "confirm", "edible") or a free value ("60").
  // A field without an answer stays open: silence is not consent.
  answers?: Record<string, string>
  // Which route-pending option the operator reviews (0 = best ranked). null skips the review.
  reviewRouteIndex?: number | null
  decision?: { outcome: "approved" | "rejected"; proposalIndex?: number; reason?: string } | null
}

export type DemoResult = {
  case: OfferCase
  stoppedAt: "needs_information" | "needs_route_review" | "no_feasible_option" | "awaiting_decision" | "decided"
  error: { code: string; message: string } | null
}

function toResponse(i: Interaction, answer: string): { responseId: string; text?: string } {
  return i.allowedResponses.some((r) => r.id === answer) ? { responseId: answer } : { responseId: "provide_value", text: answer }
}

// Runs the whole loop once, in memory. Nothing is stored and no message is sent.
export function runDemoFlow(input: DemoInput = {}): DemoResult {
  const at = (hhmm: string) => `${DEMO_DAY}T${hhmm}:00.000Z`
  const answers = input.answers ?? DEMO_ANSWERS
  const destinations = input.destinations ?? DEMO_DESTINATIONS
  const vehicles = input.vehicles ?? DEMO_VEHICLES
  let c = receiveOffer(input.offer ?? demoOffer(), at("17:00"), DEMO_ACTORS.donor.id)

  const stop = (stoppedAt: DemoResult["stoppedAt"], e: FlowError | null = null): DemoResult => ({
    case: c,
    stoppedAt,
    error: e ? { code: e.code, message: e.message } : null,
  })

  try {
    c = requestInformation(c, at("17:01"))
    for (const i of c.interactions) {
      const reply = answers[i.field]
      if (reply !== undefined) c = answerInteraction(c, i.id, DEMO_ACTORS.donor, toResponse(i, reply), at("17:05"))
    }
    // A rejected confirmation opens a clarifying question; it stays open unless answered in another run.
    c = requestInformation(c, at("17:06"))
    if (c.state === "needs_information") return stop("needs_information")

    c = proposeDestinations(c, destinations, vehicles, at("17:10"))
    if (c.state === "needs_route_review") {
      const pending = c.proposals.filter(onlyNeedsRouteReview)
      const index = input.reviewRouteIndex === undefined ? 0 : input.reviewRouteIndex
      if (index === null || !pending[index]) return stop("needs_route_review")
      c = reviewRoute(c, DEMO_ACTORS.operator, pending[index].id, destinations, vehicles, at("17:11"))
    }
    if (c.state === "no_feasible_option") return stop("no_feasible_option")
    if (!input.decision) return stop("awaiting_decision")

    const proposal = c.proposals[input.decision.proposalIndex ?? 0]
    c = recordDecision(
      c,
      DEMO_ACTORS.operator,
      { outcome: input.decision.outcome, proposalId: proposal?.id ?? null, reason: input.decision.reason ?? null },
      at("17:12"),
    )
    return stop("decided")
  } catch (e) {
    if (e instanceof FlowError) {
      const state = c.state as string
      return stop(state === "proposed" ? "awaiting_decision" : state === "needs_route_review" ? "needs_route_review" : "needs_information", e)
    }
    throw e
  }
}
