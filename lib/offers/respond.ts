import {
  NetworkError,
  acceptQuote,
  availableKg,
  cancelReservation,
  chooseDelivery,
  declineQuote,
  deliveryChoices,
  notified,
  reserve,
  stopHandoff,
  tick,
} from "../network/coordinator.ts";
import { allocateTier, matchResource } from "../network/match.ts";
import type { DeliveryMode, Ms, Network, NetworkCase, Quote, Reservation } from "../network/types.ts";
import type { Offer } from "./types.ts";

// Receiver and donor actions over an offer (E4). Pure transitions: every mutation ticks the case
// first (holds expire, waves widen), runs one coordinator step, and re-derives notifiedIds.
// Coordinator errors become OfferError with an HTTP status; routes only persist the result.

export class OfferError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "OfferError";
    this.code = code;
    this.status = status;
  }
}

export function statusFor(code: string): number {
  switch (code) {
    case "not_notified":
    case "not_receiver":
    case "not_carrier":
    case "not_donor":
    case "not_holder":
    case "unknown_participant":
    case "own_offer":
      return 403;
    case "unknown_reservation":
      return 404;
    case "not_open":
    case "window_closed":
    case "over_available":
    case "has_reservations":
      return 409;
    default:
      return 400;
  }
}

function fail(e: unknown): never {
  if (e instanceof NetworkError) throw new OfferError(e.code, statusFor(e.code), e.message);
  throw e;
}

function mustCase(offer: Offer): NetworkCase {
  if (!offer.case) throw new OfferError("no_case", 409, "Esta oferta aún no tiene destinos coordinados.");
  return offer.case;
}

function mustHold(c: NetworkCase, reservationId: string, participantId: string): Reservation {
  const r = c.reservations.find((x) => x.id === reservationId);
  if (!r) throw new OfferError("unknown_reservation", 404, "Apartado no encontrado.");
  if (r.participantId !== participantId) throw new OfferError("not_holder", 403, "Solo quien apartó decide sobre su apartado.");
  return r;
}

function syncNotified(offer: Offer, c: NetworkCase): Offer {
  return { ...offer, case: c, notifiedIds: [...notified(c)] };
}

/** A notified receiver holds part (or all) of the lot. The donor can never hold its own offer. */
export function reserveHold(offer: Offer, participantId: string, kg: number, now: Ms, network: Network): Offer {
  if (participantId === offer.donorRegId) throw new OfferError("own_offer", 403, "No puedes apartar tu propia oferta.");
  try {
    const c = tick(mustCase(offer), network, now);
    return syncNotified(offer, reserve(c, network, participantId, kg, now));
  } catch (e) { fail(e); }
}

/** Delivery choices for one of the caller's held reservations. */
export function choicesFor(offer: Offer, participantId: string, reservationId: string, now: Ms, network: Network): Quote[] {
  const c = tick(mustCase(offer), network, now);
  mustHold(c, reservationId, participantId);
  try {
    return deliveryChoices(c, network, reservationId, now);
  } catch (e) { fail(e); }
}

/** The holder picks pickup (free) or delivery (cost on them; courier quotes are simulated). */
export function chooseDeliveryMode(offer: Offer, participantId: string, reservationId: string, mode: DeliveryMode, vehicleId: string | null, now: Ms, network: Network): Offer {
  const ticked = tick(mustCase(offer), network, now);
  mustHold(ticked, reservationId, participantId);
  try {
    return syncNotified(offer, chooseDelivery(ticked, network, reservationId, mode, now, vehicleId));
  } catch (e) { fail(e); }
}

/** The holder accepts or declines a courier quote. Accepting never confirms capacity. */
export function answerQuote(offer: Offer, participantId: string, reservationId: string, accept: boolean, now: Ms, network: Network): Offer {
  const ticked = tick(mustCase(offer), network, now);
  mustHold(ticked, reservationId, participantId);
  try {
    const next = accept
      ? acceptQuote(ticked, reservationId, participantId, now)
      : declineQuote(ticked, reservationId, participantId, now);
    return syncNotified(offer, next);
  } catch (e) { fail(e); }
}

/** The holder releases a hold. The donor cannot cancel holds, only stop a handoff in course. */
export function cancelHold(offer: Offer, participantId: string, reservationId: string, now: Ms, network: Network): Offer {
  const ticked = tick(mustCase(offer), network, now);
  mustHold(ticked, reservationId, participantId);
  try {
    return syncNotified(offer, cancelReservation(ticked, reservationId, participantId, now));
  } catch (e) { fail(e); }
}

/**
 * The donor stops a handoff in course over an anomaly. Only scheduled or in-transit
 * reservations stop; holds are the receiver's until they expire or cancel.
 */
export function stopDelivery(offer: Offer, donorParticipantId: string, reservationId: string, reason: string, now: Ms): Offer {
  if (donorParticipantId !== offer.donorRegId) throw new OfferError("not_donor", 403, "Solo el donante detiene una entrega.");
  const why = reason.trim().slice(0, 280);
  if (!why) throw new OfferError("invalid_request", 400, "Di el motivo de la detención.");
  try {
    return syncNotified(offer, stopHandoff(mustCase(offer), reservationId, why, donorParticipantId, now));
  } catch (e) { fail(e); }
}

/**
 * The donor declares the lot weight. Count-only lots (kg 0) cannot be held until this lands;
 * once any hold exists the weight is frozen. Rebuilds eligibility and re-opens the waves.
 */
export function declareWeight(offer: Offer, donorUid: string, kg: number, now: Ms, network: Network): Offer {
  if (donorUid !== offer.donorUid) throw new OfferError("not_donor", 403, "Solo el donante declara el peso.");
  if (!Number.isFinite(kg) || kg <= 0) throw new OfferError("bad_quantity", 400, "El peso debe ser mayor a cero.");
  const c = mustCase(offer);
  if (c.reservations.some((r) => !["cancelled", "expired"].includes(r.status))) {
    throw new OfferError("has_reservations", 409, "Ya hay apartados en curso; el peso ya no se puede cambiar.");
  }
  const resource = { ...c.resource, kg: Math.round(kg * 10) / 10 };
  const matches = matchResource(resource, network, resource.kg, now);
  const tier = allocateTier(matches, []);
  const withEvent: NetworkCase = {
    ...c,
    resource,
    status: tier ? "open" : "no_destination",
    activeTier: tier,
    passedTiers: [],
    waves: [],
    events: [...c.events, {
      seq: c.events.length + 1, at: now, type: "weight_declared", actor: c.resource.donorId,
      detail: { kg: resource.kg, provenance: "declarado por el donante" },
    }],
  };
  const next = tick(withEvent, network, now);
  const eligible = matches.filter((m) => m.eligible)
    .map((m) => ({ participantId: m.participantId, name: m.name, tier: m.tier, zone: m.zone, score: m.score, maxKg: m.maxKg }));
  const reviewReasons = eligible.length > 0
    ? offer.reviewReasons.filter((r) => !r.includes("Sin destino elegible"))
    : offer.reviewReasons;
  return {
    ...syncNotified(offer, next),
    eligible,
    tier,
    reviewReasons,
    reviewNeeded: reviewReasons.length > 0,
    status: reviewReasons.length > 0 ? "needs_review" : "open",
  };
}

export { availableKg };
export type { Quote };
