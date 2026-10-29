/**
 * Backhaul opportunity detector.
 * Finds a second compatible task for already-moving capacity after a confirmed drop-off.
 * It does not dispatch drivers or assume that a rideshare platform permits cargo carriage.
 */
const parseTime = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") { const n = Date.parse(v); return Number.isFinite(n) ? n : null; }
  return null;
};
const block = (code, message) => ({ code, message });

export function evaluateBackhaul({ trip, offer, recipient, route, now = Date.now() }) {
  const blockers = [];
  const warnings = [];
  if (!trip || !offer || !recipient || !route) {
    return { feasible: false, blockers: [block("missing_inputs", "Trip, offer, recipient, and route estimate are required.")], warnings, score: null };
  }
  if (trip.vehicleConfirmed !== true) blockers.push(block("vehicle_unconfirmed", "The vehicle/driver has not confirmed the trip or availability."));
  if (trip.originalDeliveryConfirmed !== true) blockers.push(block("first_drop_unconfirmed", "The first delivery must be confirmed before planning a return trip."));
  if (!Number.isFinite(trip.capacity) || trip.capacity <= 0) blockers.push(block("capacity_unknown", "Usable vehicle capacity is not confirmed."));
  if (!Number.isFinite(trip.loadAfterDropoff) || trip.loadAfterDropoff < 0) blockers.push(block("load_unknown", "Remaining load after delivery is not confirmed."));
  if (!Number.isFinite(offer.quantity) || offer.quantity <= 0 || offer.quantityConfirmed !== true) blockers.push(block("offer_quantity_unconfirmed", "Offer quantity must be confirmed."));
  if (Number.isFinite(trip.capacity) && Number.isFinite(trip.loadAfterDropoff) && Number.isFinite(offer.quantity) && trip.loadAfterDropoff + offer.quantity > trip.capacity) blockers.push(block("vehicle_capacity", "Existing load plus surplus exceeds available capacity."));
  if (offer.donorConfirmed !== true || offer.shareConsent !== true) blockers.push(block("donor_consent", "The donor must confirm the offer and authorize sharing the required data."));
  if (recipient.confirmed !== true) blockers.push(block("recipient_unconfirmed", "The second delivery recipient is not confirmed."));
  if (!Array.isArray(recipient.categories) || !recipient.categories.includes(offer.category)) blockers.push(block("category_mismatch", "The recipient does not accept this category."));
  if (!Array.isArray(recipient.conditionPolicy) || !recipient.conditionPolicy.includes(offer.condition)) blockers.push(block("condition_policy", "The declared condition does not meet the recipient policy."));
  const intendedUse = recipient.intendedUse || recipient.type || "";
  if (/human_consumption|consumo humano|people/i.test(intendedUse) && (offer.condition !== "edible" || offer.conditionConfirmed !== true)) blockers.push(block("food_safety", "Human consumption requires an edible condition and independent human confirmation."));

  const deadline = parseTime(offer.deadline);
  const tripEnd = parseTime(trip.availableUntil);
  const pickupAt = parseTime(route.pickupEta);
  const deliveryAt = parseTime(route.deliveryEta);
  if (deadline === null) blockers.push(block("deadline_unknown", "The offer has no valid deadline."));
  else if (deadline <= now) blockers.push(block("deadline_passed", "The offer has expired."));
  if (tripEnd === null) blockers.push(block("trip_window_unknown", "The trip availability window is not confirmed."));
  if (pickupAt === null || deliveryAt === null) blockers.push(block("eta_unknown", "Pickup and delivery ETAs are required."));
  else {
    if (deadline !== null && pickupAt > deadline) blockers.push(block("pickup_late", "Pickup would occur after the deadline."));
    if (tripEnd !== null && deliveryAt > tripEnd) blockers.push(block("trip_window_exceeded", "The second delivery exceeds the vehicle availability window."));
  }
  if (route.verified !== true || !route.provider || !Number.isFinite(route.incrementalKm) || route.incrementalKm < 0 || !Number.isFinite(route.emptyKmAvoided) || route.emptyKmAvoided < 0 || !Number.isFinite(route.incrementalMinutes) || route.incrementalMinutes < 0) {
    blockers.push(block("route_unverified", "Detour and avoided empty kilometers must come from a verified route."));
  }
  const netKmBenefit = route.verified === true && Number.isFinite(route.emptyKmAvoided) && Number.isFinite(route.incrementalKm) ? Number((route.emptyKmAvoided - route.incrementalKm).toFixed(2)) : null;
  if (netKmBenefit !== null && netKmBenefit <= 0) blockers.push(block("no_net_route_benefit", "The detour does not reduce net kilometers compared with the baseline return trip."));
  if (trip.transportPermissionConfirmed !== true) blockers.push(block("transport_terms_unconfirmed", "Carrier/platform terms must be confirmed to allow this cargo type."));

  const feasible = blockers.length === 0;
  const score = feasible ? Number(Math.min(1, netKmBenefit / Math.max(1, route.emptyKmAvoided)).toFixed(5)) : null;
  if (feasible) warnings.push(block("human_dispatch_required", "Opportunity calculated; human approval is required before contacting the driver or executing the route."));
  return {
    feasible,
    score,
    scoreVersion: "grinflow-backhaul-v1",
    netKmBenefit,
    estimatedEmptyKmAvoided: route.verified === true ? route.emptyKmAvoided : null,
    estimatedIncrementalKm: route.verified === true ? route.incrementalKm : null,
    estimatedIncrementalMinutes: route.verified === true ? route.incrementalMinutes : null,
    route: route.verified === true ? { provider: route.provider, verifiedAt: route.verifiedAt || null } : null,
    blockers,
    warnings
  };
}

/** @param {any} input @param {any[]} [opportunities] */
export function rankBackhaulOpportunities(input, opportunities = []) {
  return opportunities.map((candidate) => ({
    offerId: candidate.offer?.id || null,
    recipientId: candidate.recipient?.id || null,
    ...evaluateBackhaul({ ...input, ...candidate })
  })).sort((a, b) => Number(b.feasible) - Number(a.feasible) || (b.score ?? -1) - (a.score ?? -1));
}
