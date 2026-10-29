import { rankBackhaulOpportunities } from "../engines/backhaul.mjs";

/** Synthetic return-trip scenario. Fixed clock so the preview never expires. */
export const DEMO_NOW = Date.parse("2026-11-03T21:10:00Z"); // 15:10 in Mexico City

export type TripToggles = { vehicleConfirmed: boolean; originalDeliveryConfirmed: boolean; transportPermissionConfirmed: boolean };
export type CandidateToggles = { donorConsent: boolean; quantityConfirmed: boolean; conditionConfirmed: boolean; routeReviewed: boolean };

export const DEMO_TRIP = {
  vehicle: "Luis's van",
  firstDrop: "60 kg of bread delivered to Doctores community kitchen at 15:05",
  capacity: 400,
  loadAfterDropoff: 0,
  availableUntil: "2026-11-04T00:00:00Z", // 18:00 local
  returnTo: "Iztapalapa depot"
};

export const DEMO_CANDIDATES = [
  {
    id: "jamaica-tomatoes",
    title: "120 kg of tomatoes, past their prime",
    donor: "Mercado Jamaica stall 14",
    recipientName: "Iztapalapa compost plant",
    offer: { id: "jamaica-tomatoes", category: "verduras", quantity: 120, condition: "past_prime", deadline: "2026-11-03T23:30:00Z" },
    recipient: { id: "compost", categories: ["verduras", "frutas", "organico"], conditionPolicy: ["past_prime", "inedible"], intendedUse: "valorization" },
    route: { incrementalKm: 2.1, emptyKmAvoided: 9.4, incrementalMinutes: 14, pickupEta: "2026-11-03T21:35:00Z", deliveryEta: "2026-11-03T22:20:00Z" }
  },
  {
    id: "espiga-bread",
    title: "40 boxes of bread for people (≈60 kg)",
    donor: "La Espiga Bakery",
    recipientName: "Norte shelter",
    offer: { id: "espiga-bread", category: "panificados", quantity: 60, condition: "edible", deadline: "2026-11-04T00:30:00Z" },
    recipient: { id: "norte", categories: ["panificados", "frutas", "verduras", "abarrotes"], conditionPolicy: ["edible"], intendedUse: "human_consumption" },
    route: { incrementalKm: 6.8, emptyKmAvoided: 9.4, incrementalMinutes: 31, pickupEta: "2026-11-03T21:40:00Z", deliveryEta: "2026-11-03T23:05:00Z" }
  },
  {
    id: "central-fruit",
    title: "500 kg of mixed fruit",
    donor: "Central de Abasto warehouse",
    recipientName: "Iztapalapa compost plant",
    offer: { id: "central-fruit", category: "frutas", quantity: 500, condition: "past_prime", deadline: "2026-11-03T23:00:00Z" },
    recipient: { id: "compost", categories: ["verduras", "frutas", "organico"], conditionPolicy: ["past_prime", "inedible"], intendedUse: "valorization" },
    route: { incrementalKm: 4.0, emptyKmAvoided: 9.4, incrementalMinutes: 22, pickupEta: "2026-11-03T21:50:00Z", deliveryEta: "2026-11-03T22:40:00Z" }
  },
  {
    id: "roma-lettuce",
    title: "30 kg of lettuce, far off the return path",
    donor: "Roma Norte restaurant",
    recipientName: "Iztapalapa compost plant",
    offer: { id: "roma-lettuce", category: "verduras", quantity: 30, condition: "past_prime", deadline: "2026-11-03T23:30:00Z" },
    recipient: { id: "compost", categories: ["verduras", "frutas", "organico"], conditionPolicy: ["past_prime", "inedible"], intendedUse: "valorization" },
    route: { incrementalKm: 11.2, emptyKmAvoided: 9.4, incrementalMinutes: 40, pickupEta: "2026-11-03T21:45:00Z", deliveryEta: "2026-11-03T22:55:00Z" }
  }
] as const;

export type DemoCandidate = (typeof DEMO_CANDIDATES)[number];

/** Builds engine input from the operator's toggles. A reviewed route is labelled as such, never as provider-verified. */
export function evaluateDemo(trip: TripToggles, toggles: Record<string, CandidateToggles>) {
  const input = {
    trip: { ...trip, capacity: DEMO_TRIP.capacity, loadAfterDropoff: DEMO_TRIP.loadAfterDropoff, availableUntil: DEMO_TRIP.availableUntil },
    now: DEMO_NOW
  };
  const opportunities = DEMO_CANDIDATES.map(c => {
    const t = toggles[c.id];
    return {
      offer: { ...c.offer, quantityConfirmed: t.quantityConfirmed, conditionConfirmed: t.conditionConfirmed, donorConfirmed: t.donorConsent, shareConsent: t.donorConsent },
      recipient: { ...c.recipient, categories: [...c.recipient.categories], conditionPolicy: [...c.recipient.conditionPolicy], confirmed: true },
      route: { ...c.route, verified: t.routeReviewed, provider: t.routeReviewed ? "operator review of straight-line estimate (demo)" : undefined }
    };
  });
  return rankBackhaulOpportunities(input, opportunities);
}

export const ALL_CONFIRMED: CandidateToggles = { donorConsent: true, quantityConfirmed: true, conditionConfirmed: true, routeReviewed: true };
export const NONE_CONFIRMED: CandidateToggles = { donorConsent: false, quantityConfirmed: false, conditionConfirmed: false, routeReviewed: false };
