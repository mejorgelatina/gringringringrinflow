// Domain types for the coordination loop:
// offer arrives → gaps identified → confirmation requested → destinations proposed → human decision logged.

export type FieldStatus = "missing" | "reported" | "confirmed"

// Every offer field carries where it came from. A value reported in a message is not a confirmed value.
export type TrackedField<T> = {
  value: T | null
  status: FieldStatus
  source: string | null
}

export type Condition = "good" | "near_expiry" | "damaged" | "unknown"

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
  // Tier-1 (people) destinations never take food of unknown or damaged condition.
  acceptsConditions: Condition[]
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

export type InteractionState = "open" | "answered" | "expired" | "cancelled"

export type Interaction = {
  id: string
  offerId: string
  field: OfferFieldName
  kind: "clarify" | "confirm"
  targetRole: Role
  targetActorId: string | null
  question: string
  // null means free answer; otherwise the answer must be one of these.
  allowedAnswers: string[] | null
  createdAt: string
  expiresAt: string
  state: InteractionState
  answer: string | null
  answeredBy: string | null
  answeredAt: string | null
  history: { at: string; state: InteractionState; by: string | null; note: string | null }[]
}

export type Block = { code: string; message: string }

export type Proposal = {
  id: string
  destinationId: string
  vehicleId: string
  feasible: boolean
  blocks: Block[]
  // Only meaningful when feasible; a high score never overrides a block.
  score: number | null
  reasons: string[]
  distanceKm: number
}

export type CaseState =
  | "received"
  | "needs_information"
  | "ready_to_match"
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
  decision: Decision | null
  events: FlowEvent[]
}
