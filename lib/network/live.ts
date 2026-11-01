import { DEMO_NETWORK } from "./demo.ts"
import { carriersEnabled } from "./features.ts"
import type { Network, Participant } from "./types.ts"

// The network every channel evaluates against: the synthetic pilot participants plus the organizations that
// registered through whatsapp and a person verified. Registered participants are loaded asynchronously by
// lib/registry (refreshLiveNetwork) and cached here so the engine stays synchronous.

let registered: Participant[] = []

export function setRegisteredParticipants(list: Participant[]) {
  registered = list
}

export function registeredParticipants(): Participant[] {
  return registered
}

/** Demo participants without carriers when carriers are hidden, plus verified registrations. */
export function liveNetwork(): Network {
  const carriers = carriersEnabled()
  const demo = DEMO_NETWORK.participants.filter((p) => carriers || !p.roles.every((r) => r === "carrier"))
  const ids = new Set(registered.map((p) => p.id))
  return {
    area: DEMO_NETWORK.area,
    vehicles: carriers ? DEMO_NETWORK.vehicles : [],
    participants: [...demo.filter((p) => !ids.has(p.id)), ...registered],
  }
}
