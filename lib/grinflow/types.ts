// Domain types for the coordination loop:
// offer arrives → gaps identified → confirmation requested → destinations proposed → human decision logged.

export type FieldStatus = "missing" | "reported" | "confirmed"

// Every offer field carries where it came from. A value reported in a message is not a confirmed value.
export type TrackedField<T> = {
  value: T | null
  status: FieldStatus
  source: string | null
}

// Same vocabulary as the v0.10 engines and the extraction schema.
export type Condition = "edible" | "past_prime" | "inedible" | "unknown"

export type Use = "human_consumption" | "valorization"

export type TimeWindow = { start: string; end: string }

export type Point = { lat: number; lng: number }

export type Offer = {
  id: string
  donorId: string
  rawMessage: string | null
  product: TrackedField<string>
  category: TrackedField<string>
  quantity: TrackedField<number>
  unit: TrackedField<string>
  weightKg: TrackedField<number>
  condition: TrackedField<Condition>
  pickupLocation: TrackedField<Point>
  pickupWindow: TrackedField<TimeWindow>
}

export type OfferFieldName = Exclude<keyof Offer, "id" | "donorId" | "rawMessage">

export type Destination = {
  id: string
  name: string
  use: Use
  acceptedCategories: string[]
  // Remaining receiving capacity today, in kg.
  capacityKg: number
  location: Point
  receivingWindow: TimeWindow
  // Tier-1 (people) destinations only take food confirmed as edible.
  acceptsConditions: Condition[]
  // Capacity and availability confirmed by the receiver.
  confirmed: boolean
}

export type Vehicle = {
  id: string
  label: string
  capacityKg: number
  location: Point
  availableWindow: TimeWindow
  // Availability declared in a demo is not a reservation.
  availabilityConfirmed: boolean
  refrigerated: boolean
}

export type Role = "donor" | "operator" | "receiver" | "driver"

export type Actor = { id: string; role: Role; name: string }

// Shape produced by lib/engines/interactions.mjs (Human Interaction Layer v0.10), plus the offer field it resolves.
export type InteractionStatus = "pending" | "answered" | "expired" | "cancelled"

export type AllowedResponse = { id: string; label: string; effect: string }

export type Interaction = {
  id: string
  entityId: string
  reasonCode: string
  targetRole: Role
  targetActorId: string | null
  channel: string
  question: string
  allowedResponses: AllowedResponse[]
  expiresAt: string
  status: InteractionStatus
  createdAt: string
  createdBy: string
  response: {
    responseId: string
    label: string
    effect: string
    text: string
    actorId: string
    actorRole: Role
    evidenceReference: string | null
    at: string
  } | null
  events: { type: string; at: string; actor: string; [key: string]: unknown }[]
  field: OfferFieldName
  kind: "clarify" | "confirm"
}

export type Block = { code: string; message: string }

export type RouteEstimate = {
  distanceKm: number
  durationMinutes: number
  pickupAt: string | null
  estimatedArrivalAt: string | null
  source: "straight_line_estimate"
}

export type RouteReview = {
  pairKey: string
  reviewedBy: string
  reviewedAt: string
  distanceKm: number
  durationMinutes: number
  estimatedArrivalAt: string
}

export type Proposal = {
  id: string
  destinationId: string
  vehicleId: string
  feasible: boolean
  // Blockers from the v0.10 match engine plus pickup/delivery window checks from this flow.
  blocks: Block[]
  warnings: Block[]
  // v0.10 score in [0, 1]; only set when feasible. A score never overrides a block.
  score: number | null
  scoreVersion: string
  reasons: string[]
  estimate: RouteEstimate
  routeReviewed: boolean
}

export type CaseState =
  | "received"
  | "needs_information"
  | "ready_to_match"
  | "needs_route_review"
  | "proposed"
  | "no_feasible_option"
  | "approved"
  | "rejected"

export type FlowEvent = {
  seq: number
  at: string
  type: string
  actorId: string | null
  detail: Record<string, unknown>
}

export type Decision = {
  outcome: "approved" | "rejected"
  proposalId: string | null
  decidedBy: string
  decidedAt: string
  reason: string | null
}

export type OfferCase = {
  offer: Offer
  state: CaseState
  interactions: Interaction[]
  proposals: Proposal[]
  routeReviews: RouteReview[]
  decision: Decision | null
  events: FlowEvent[]
}
