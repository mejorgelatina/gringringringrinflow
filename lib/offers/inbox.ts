import { availableKg, notified, tick } from "../network/coordinator.ts";
import { matchResource } from "../network/match.ts";
import type { Ms, Network, NetworkCase, Quote, Reservation, Resource, Tier, Zone } from "../network/types.ts";
import { choicesFor } from "./respond.ts";
import type { Offer } from "./types.ts";

// The receiver view of an offer (E4): what the inbox shows, with pickup details hidden until the
// receiver commits to a hold. Donors see their own lots whole; holders see the pickup point once
// their reservation is scheduled.

export type RedactedResource = Omit<Resource, "location"> & { location: { lat: number; lng: number } | null };
export type ViewerOffer = Omit<Offer, "case" | "location"> & {
  location: string | null;
  case: (Omit<NetworkCase, "resource"> & { resource: RedactedResource }) | null;
};

export type InboxItem = {
  offer: ViewerOffer;
  /** The viewer's own match: zone, eta and capacity. Null when no longer eligible. */
  myMatch: { tier: Tier; zone: Zone; etaMinutes: number; roadKm: number; maxKg: number } | null;
  /** The viewer's reservations on this lot. */
  mine: Reservation[];
  availableKg: number;
  /** Delivery choices for each held reservation of the viewer, by reservation id. */
  choices: Record<string, Quote[]>;
};

/** Pure clock advance for reads: expiries and waves show truthfully without a write. */
export function tickOffer(offer: Offer, network: Network, now: Ms): Offer {
  if (!offer.case) return offer;
  const c = tick(offer.case, network, now);
  return { ...offer, case: c, notifiedIds: [...notified(c)] };
}

function committed(mine: Reservation[]): boolean {
  return mine.some((r) => ["scheduled", "in_transit", "delivered"].includes(r.status));
}

function redact(offer: Offer, hidePickup: boolean): ViewerOffer {
  if (!hidePickup) return offer as ViewerOffer;
  return {
    ...offer,
    location: null,
    case: offer.case ? { ...offer.case, resource: { ...offer.case.resource, location: null } } : null,
  };
}

/**
 * Inbox of one participant: lots where it was notified, newest first. Each item carries its own
 * match and reservations; pickup details stay hidden until one of its holds is scheduled.
 */
export function inboxFor(offers: Offer[], participantId: string, network: Network, now: Ms): InboxItem[] {
  return offers
    .filter((o) => o.notifiedIds.includes(participantId))
    .map((o) => tickOffer(o, network, now))
    .map((o) => {
      const mine = o.case?.reservations.filter((r) => r.participantId === participantId) ?? [];
      const m = o.case ? matchResource(o.case.resource, network, availableKg(o.case), now).find((x) => x.participantId === participantId) ?? null : null;
      const choices: Record<string, Quote[]> = {};
      for (const r of mine) {
        if (r.status !== "held") continue;
        try { choices[r.id] = choicesFor(o, participantId, r.id, now, network); } catch { choices[r.id] = []; }
      }
      return {
        offer: redact(o, !committed(mine)),
        myMatch: m ? { tier: m.tier, zone: m.zone, etaMinutes: m.etaMinutes, roadKm: m.roadKm, maxKg: m.maxKg } : null,
        mine,
        availableKg: o.case ? availableKg(o.case) : 0,
        choices,
      };
    })
    .sort((a, b) => b.offer.createdAt.localeCompare(a.offer.createdAt));
}
