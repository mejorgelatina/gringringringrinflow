import { parseAccepts, parseAddress, parseGenerates, parseHours } from "./parse.ts"
import { digits } from "./store.ts"
import type { RegisteredRole, Registration } from "./types.ts"

// Builds a Registration from the web account form (E1) by reusing the chat onboarding parsers,
// so typed answers mean the same thing on both channels. Chat onboarding keeps its own step flow
// in onboarding.ts; this only validates and normalizes the structured profile the form sends.

export type OrgProfileInput = {
  name: string
  roles: RegisteredRole[]
  address?: string | null
  hoursText?: string | null
  contactName?: string | null
  contactPhone?: string | null
  acceptsText?: string | null
  generatesText?: string | null
  selfPickup?: boolean | null
}

export class InvalidProfileError extends Error {}

const KNOWN_ROLES: RegisteredRole[] = ["donor", "receiver", "maker", "compost"]

export function buildWebRegistration(
  input: OrgProfileInput,
  ids: { id: string; ownerUid: string; now: string },
): Registration {
  const name = input.name?.trim() ?? ""
  if (!name) throw new InvalidProfileError("name is required")
  const roles = [...new Set(input.roles ?? [])]
  if (!roles.length) throw new InvalidProfileError("at least one role is required")
  for (const r of roles) {
    if (!KNOWN_ROLES.includes(r)) throw new InvalidProfileError(`unknown role: ${r}`)
  }
  const hoursText = (input.hoursText ?? "").trim().slice(0, 200)
  const address = input.address?.trim() || null
  const placed = address ? parseAddress(address) : { address: null, area: null, point: null }
  const contactName = (input.contactName ?? "").trim()
  const contacts = contactName ? [{ name: contactName.slice(0, 80), phone: digits(input.contactPhone ?? "") }] : []
  const acceptsText = (input.acceptsText ?? "").trim()
  const generatesText = (input.generatesText ?? "").trim()
  return {
    id: ids.id,
    phone: contacts[0]?.phone ?? "",
    ownerUid: ids.ownerUid,
    source: "web",
    name: name.slice(0, 120),
    roles,
    address: placed.address,
    location: placed.point,
    locationSource: placed.point ? "colonia" : null,
    area: placed.area,
    hours: hoursText ? parseHours(hoursText) : null,
    hoursText,
    contacts,
    accepts: acceptsText ? parseAccepts(acceptsText, roles) : null,
    generates: generatesText && roles.includes("donor") ? parseGenerates(generatesText) : null,
    selfPickup: input.selfPickup ?? null,
    whatsappOptIn: false,
    status: "pending",
    createdAt: ids.now,
    updatedAt: ids.now,
    verifiedAt: null,
    verifiedBy: null,
    notes: null,
  }
}
