import type { Point } from "../network/types.ts"

// An organization that registered itself through whatsapp (or the web chat). It enters the network only
// after a person on the grinflow team verifies it. Contact data is personal data: only the team view shows it.

export type RegisteredRole = "donor" | "receiver" | "maker" | "compost"

export type Contact = { name: string; phone: string }

/** Days of week (0 = sunday) and minutes after local midnight. Same shape as the network's WeeklyWindow. */
export type WeeklyHours = { days: number[]; from: number; to: number }

export type Accepts = {
  /** Food categories (receiver, compost). */
  categories: string[]
  /** Named materials a maker uses ("cáscara de huevo"). */
  materials: string[]
  /** Specs the material must meet ("limpia", "seca", "molida"). */
  requires: string[]
  weeklyKg: number | null
  text: string
}

export type Generates = {
  categories: string[]
  kgPerWeek: number | null
  frequency: "diaria" | "semanal" | "eventual" | null
  text: string
}

export type RegistrationStatus = "pending" | "verified" | "rejected"

export type Registration = {
  id: string
  /** The whatsapp number that registered it (digits only). */
  phone: string
  source: "webhook" | "simulator" | "web"
  name: string
  roles: RegisteredRole[]
  /** As written by the person, or the address whatsapp attaches to a location pin. */
  address: string | null
  location: Point | null
  locationSource: "pin" | "colonia" | null
  area: string | null
  hours: WeeklyHours | null
  hoursText: string
  contacts: Contact[]
  accepts: Accepts | null
  generates: Generates | null
  /** The receiver collects with its own people or vehicle; false = it sends its own courier (an uber). */
  selfPickup: boolean | null
  /** Accepted that grinflow writes first on whatsapp with offers and notices (business-initiated needs opt-in). */
  whatsappOptIn: boolean
  status: RegistrationStatus
  createdAt: string
  updatedAt: string
  verifiedAt: string | null
  verifiedBy: string | null
  notes: string | null
}

export type OnboardingStep = "role" | "name" | "location" | "hours" | "contact" | "accepts" | "pickup" | "generates" | "confirm"

export type OnboardingState = {
  step: OnboardingStep
  draft: Partial<Registration>
  /** An existing registration being updated (same phone). */
  editingId: string | null
  startedAt: string
}

export type Turn = { text: string; at: string }

/** What grinflow remembers about one sender between messages. */
export type Conversation = {
  key: string
  phone: string
  source: Registration["source"]
  /** The sender's recent messages about the offer or need in progress, oldest first. */
  history: Turn[]
  /** The last reply asked something; the next message most likely answers it. */
  openQuestion: boolean
  onboarding: OnboardingState | null
  /** The last location pin the sender shared, if it was not part of onboarding. */
  pin: { point: Point; label: string; at: string } | null
  /** The agent run this sender's last offer opened; their next answer goes to it while it waits for them. */
  activeRun?: { code: string; at: string } | null
  updatedAt: string
}

export type InboxItem = {
  id: string
  at: string
  phone: string
  source: Registration["source"]
  kind: "offer" | "need" | "registration" | "message"
  /** One line of what was understood. */
  summary: string
  text: string
  registrationId: string | null
  feasible: number
  /** Tracking code of the agent run this offer opened automatically, if any. */
  runCode?: string | null
  /** Last known state of that run ("needs_input", "awaiting_approval", "approved"…). */
  runStatus?: string | null
}

/** Who an agent run came from, kept server-side only (the sealed run travels to browsers; the phone must not). */
export type RunLink = {
  code: string
  phone: string
  source: Registration["source"]
  conversationKey: string
  inboxId: string
  /** Last time the donor wrote: WhatsApp allows free-form replies only within 24 h of it. */
  lastInboundAt: string
}

export type NoticeAudience = "donor" | "receiver" | "organization"
export type NoticeStatus = "sent" | "preview" | "failed" | "skipped"

/** One outbound WhatsApp message grinflow decided to send (or would send), kept for the team to see. */
export type Notice = {
  id: string
  at: string
  audience: NoticeAudience
  /** Digits only. Personal data: /team masks it. */
  to: string
  source: Registration["source"]
  /** Free-form text inside the 24 h service window, or an approved template outside it. */
  mode: "session" | "template"
  template: { name: string; language: string; params: string[] } | null
  /** The exact text the person receives (a template rendered with its parameters). */
  body: string
  runCode: string | null
  registrationId: string | null
  status: NoticeStatus
  /** Why it was or was not sent. */
  detail: string
}
