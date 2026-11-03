import { availableKg, notified, tick } from "../network/coordinator.ts";
import { matchResource } from "../network/match.ts";
import type { CaseStatus, Ms, Network, Quote, Reservation, Resource, Tier, Zone } from "../network/types.ts";
import { choicesFor } from "./respond.ts";
import type { Offer, OfferGap, OfferStatus } from "./types.ts";
import type { ConditionEvidence } from "../meta/photo-policy.ts";

// The receiver view of an offer (E4): an allowlist projection, not an omit. Only the fields below
// ever reach a receiver; ownership (donorUid, donorRegId), the donor's raw message, the eligible
// list, the notified list, the agent data and other participants' holds stay on the server.
// Pickup details unlock only once one of the viewer's holds is scheduled.

export type ViewerResource = Omit<Resource, "location" | "donorId"> & { location: { lat: number; lng: number } | null };

export type ViewerCase = {
  resource: ViewerResource;
  status: CaseStatus;
  activeTier: Tier | null;
  passedTiers: Tier[];
  /** Only the viewer's own holds. */
  reservations: Reservation[];
  publishedAt: Ms;
};

export type ViewerOffer = {
  id: string;
  donorName: string;
  donorRegStatus: string;
  createdAt: string;
  status: OfferStatus;
  item: string | null;
  category: string | null;
  quantity: number | null;
  unit: string | null;
  deadlineHour: number | null;
  /** Null until one of the viewer's holds is scheduled. */
  location: string | null;
  condition: ConditionEvidence;
  photos: Offer["photos"];
  icc: Offer["icc"];
  gaps: OfferGap[];
  warnings: OfferGap[];
  reviewNeeded: boolean;
  reviewReasons: string[];
  tier: Tier | null;
  case: ViewerCase | null;
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

function redactResource(resource: Resource, hidePickup: boolean): ViewerResource {
  const { donorId: _donor, location, ...rest } = resource;
  void _donor;
  return { ...rest, location: hidePickup ? null : location };
}

function redact(offer: Offer, viewerId: string, hidePickup: boolean): ViewerOffer {
  return {
    id: offer.id,
    donorName: offer.donorName,
    donorRegStatus: offer.donorRegStatus,
    createdAt: offer.createdAt,
    status: offer.status,
    item: offer.item,
    category: offer.category,
    quantity: offer.quantity,
    unit: offer.unit,
    deadlineHour: offer.deadlineHour,
    location: hidePickup ? null : offer.location,
    condition: offer.condition,
    photos: offer.photos,
    icc: offer.icc,
    gaps: offer.gaps,
    warnings: offer.warnings,
    reviewNeeded: offer.reviewNeeded,
    reviewReasons: offer.reviewReasons,
    tier: offer.tier,
    case: !offer.case ? null : {
      resource: redactResource(offer.case.resource, hidePickup),
      status: offer.case.status,
      activeTier: offer.case.activeTier,
      passedTiers: offer.case.passedTiers,
      reservations: offer.case.reservations.filter((r) => r.participantId === viewerId),
      publishedAt: offer.case.publishedAt,
    },
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
        offer: redact(o, participantId, !committed(mine)),
        myMatch: m ? { tier: m.tier, zone: m.zone, etaMinutes: m.etaMinutes, roadKm: m.roadKm, maxKg: m.maxKg } : null,
        mine,
        availableKg: o.case ? availableKg(o.case) : 0,
        choices,
      };
    })
    .sort((a, b) => b.offer.createdAt.localeCompare(a.offer.createdAt));
}
