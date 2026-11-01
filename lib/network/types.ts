// One coordination model for the whole network: resources, needs, capacity, zones, actions and outcomes.
// Food banks, makers, compost operators and carriers are participants with different capabilities,
// not separate systems. A destination (where a resource goes) and logistics capacity (what moves it)
// are different objects on purpose: an org can be a valid destination with no vehicle, and a van can
// have room without being a destination.

export type Tier = "people" | "transformation" | "compost"

export type Condition = "edible" | "past_prime" | "inedible" | "unknown"

export type Point = { lat: number; lng: number }

/** Epoch milliseconds. Demo times are Mexico City local (UTC-6). */
export type Ms = number

export type TimeWindow = { start: Ms; end: Ms }

/** Recurring availability: days of week (0 = sunday) and minutes after local midnight. */
export type WeeklyWindow = { days: number[]; from: number; to: number }

export type Role = "donor" | "receiver" | "maker" | "compost" | "carrier" | "operator"

/** What a destination can receive. Same shape for a community kitchen, a maker and a compost plant. */
export type Need = {
  tier: Tier
  /** Food categories (people, compost) or named materials (makers). A maker matches on material, never on a generic waste category. */
  categories: string[]
  materials?: string[]
  conditions: Condition[]
  /** Specs the lot must state, e.g. "limpia", "seca", "sin residuo". */
  requires: string[]
  minKg: number
  maxKg: number
  weeklyCapacityKg: number
  usedThisWeekKg: number
  receiving: WeeklyWindow
  /** The destination can collect at origin with its own people or vehicle. */
  selfPickup: boolean
  /** How far its own pickup reaches, in operational minutes. */
  selfPickupMaxMinutes: number
  /**
   * ICC bands a people destination takes. "alto": food banks and high-capacity kitchens. "medio": same-day
   * kitchens and shelters close by (zone a only). Default: both. "bajo" never goes to people.
   */
  iccBands?: ("alto" | "medio")[]
  notes?: string
}

/** What a generator (hotel, supermarket, restaurant) produces regularly. */
export type ResourceStream = {
  id: string
  item: string
  category: string
  material?: string
  condition: Condition
  attributes: string[]
  kgPerWeek: number
  frequency: "diaria" | "semanal" | "eventual"
  /** Usual pickup window, minutes after local midnight. */
  typicalWindow: { from: number; to: number }
}

/**
 * A generator activates a territory. Impact zone = the discovery radius around it (who could use what it
 * generates). Whether a match is viable is still decided by eta, windows, capacity and logistics.
 */
export type Generator = {
  impactRadiusKm: number
  streams: ResourceStream[]
}

export type Participant = {
  id: string
  name: string
  roles: Role[]
  location: Point
  area: string
  /** Validated by grinflow; only verified participants receive offers. */
  verified: boolean
  /** Business-initiated whatsapp needs opt-in. */
  whatsappOptIn: boolean
  need?: Need
  generator?: Generator
  /** A receiver's own service area: it only wants offers from origins within this radius. */
  serviceRadiusKm?: number
}

/** Logistics capacity. A courier quotes per trip; a route vehicle offers its spare room on a trip it is already making. */
export type Vehicle = {
  id: string
  operatorId: string
  label: string
  kind: "courier" | "route"
  capacityKg: number
  refrigerated: boolean
  available: TimeWindow
  location: Point
  /** For a route vehicle: where the existing trip ends. Detour is measured against going there directly. */
  routeEnd?: Point
  pricing: { baseMxn: number; perKmMxn: number }
  /** Simulated: a real courier api (uber direct, lalamove) would answer here. */
  simulated: true
}

export type Resource = {
  id: string
  donorId: string
  title: string
  /** What the donor called it; makers match on this. */
  item: string
  category: string
  material?: string
  kg: number
  units?: { count: number; unit: string }
  condition: Condition
  /** Stated by the donor or confirmed by a person; an unknown condition never becomes food for people. */
  conditionConfirmed: boolean
  attributes: string[]
  location: Point
  pickupWindow: TimeWindow
  refrigerationNeeded: boolean
  rawMessage?: string
  /** The lot's ICC score and band, when it was characterized. Filters people destinations; never opens one. */
  icc?: { score: number | null; band: "alto" | "medio" | "bajo" | "pendiente" | null }
}

export type ServiceArea = {
  id: string
  name: string
  center: Point
  radiusKm: number
  /** Zone a: direct pickup viable. Zone b: viable with quoted delivery or backhaul. Beyond: zone c. */
  zoneAMaxMinutes: number
  zoneBMaxMinutes: number
}

export type Zone = "a" | "b" | "c"

export type Block = { code: string; message: string }

export type Match = {
  participantId: string
  name: string
  tier: Tier
  eligible: boolean
  blocks: Block[]
  zone: Zone
  etaMinutes: number
  roadKm: number
  /** Most this destination can take from this lot right now. */
  maxKg: number
  deliveryModes: DeliveryMode[]
  score: number
}

export type DeliveryMode = "pickup" | "courier" | "backhaul"

export type Quote = {
  mode: DeliveryMode
  vehicleId: string | null
  label: string
  costMxn: number
  roadKm: number
  /** Extra km added to an existing trip (backhaul only). */
  detourKm: number
  pickupAt: Ms
  arrivalAt: Ms
  simulated: boolean
}

export type ReservationStatus =
  | "held" // apartado: quantity held, delivery not chosen
  | "awaiting_acceptance" // quote shown; receiver has not accepted the cost
  | "awaiting_capacity" // receiver accepted; carrier has not confirmed capacity
  | "scheduled" // pickup or delivery confirmed; handoff code issued
  | "in_transit"
  | "delivered"
  | "expired"
  | "cancelled"
  | "stopped" // donor stopped the handoff over an anomaly; a person must step in

export type Reservation = {
  id: string
  participantId: string
  tier: Tier
  kg: number
  createdAt: Ms
  holdUntil: Ms | null
  status: ReservationStatus
  quote: Quote | null
  quoteAcceptedAt: Ms | null
  capacityConfirmedAt: Ms | null
  handoffCode: string | null
  pickedUpAt: Ms | null
  receivedKg: number | null
  receivedAt: Ms | null
  stopReason: string | null
}

export type Wave = { n: number; tier: Tier; at: Ms; notified: string[] }

export type NetworkEvent = { seq: number; at: Ms; type: string; actor: string; detail: Record<string, unknown> }

export type CaseStatus = "open" | "fully_reserved" | "closed" | "no_destination"

export type NetworkCase = {
  resource: Resource
  area: ServiceArea
  status: CaseStatus
  activeTier: Tier | null
  /** Tiers already exhausted for this lot, in order. */
  passedTiers: Tier[]
  waves: Wave[]
  reservations: Reservation[]
  events: NetworkEvent[]
  publishedAt: Ms
}

export type Network = {
  participants: Participant[]
  vehicles: Vehicle[]
  area: ServiceArea
}

export type Policy = {
  waveSize: number
  waveIntervalMinutes: number
  holdMinutes: number
}

export const DEFAULT_POLICY: Policy = { waveSize: 3, waveIntervalMinutes: 30, holdMinutes: 90 }

export const TIERS: Tier[] = ["people", "transformation", "compost"]

export const TIER_LABEL: Record<Tier, string> = {
  people: "personas",
  transformation: "transformación",
  compost: "composta",
}
