/**
 * GrinFlow candidate engine v1.
 * Hard constraints determine eligibility; the score only ranks eligible candidates.
 * Distances and ETAs are never inferred from neighborhood names.
 */
const HUMAN_USES = new Set(["human_consumption", "people", "consumption"]);
const finitePositive = (n) => Number.isFinite(n) && n > 0;
const asTime = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : null; }
  return null;
};

/** @param {{ offer: any, recipient: any, transport: any, now?: number, route?: any }} input */
export function evaluateMatch({ offer, recipient, transport, now = Date.now(), route = null }) {
  const blockers = [];
  const warnings = [];
  if (!offer || !recipient || !transport) {
    return { eligible: false, score: null, blockers: [{ code: "missing_candidate", message: "Offer, recipient, and transport are required to evaluate a candidate." }], warnings, route: null };
  }

  if (!offer.category || !Array.isArray(recipient.categories) || !recipient.categories.includes(offer.category)) blockers.push({ code: "category_mismatch", message: "The recipient does not accept this category." });
  if (!finitePositive(offer.quantity)) blockers.push({ code: "quantity_missing", message: "Quantity must be positive and known." });
  if (offer.quantityBasis !== "confirmed" && offer.quantityConfirmed !== true) blockers.push({ code: "quantity_unconfirmed", message: "Quantity requires human confirmation." });
  if (!offer.unit || !transport.unit || offer.unit !== transport.unit) blockers.push({ code: "unit_mismatch", message: "Offer and transport units must match or be explicitly converted." });
  if (!recipient.confirmed || recipient.status === "unconfirmed") blockers.push({ code: "recipient_unconfirmed", message: "Recipient capacity or availability is not confirmed." });
  if (!Array.isArray(recipient.conditionPolicy) || !recipient.conditionPolicy.includes(offer.condition)) blockers.push({ code: "condition_policy", message: "The declared condition does not meet the recipient policy." });
  const intendedUse = recipient.intendedUse || recipient.type || "";
  if ((HUMAN_USES.has(intendedUse) || /consumo humano/i.test(intendedUse)) && (offer.condition !== "edible" || offer.conditionConfirmed !== true)) {
    blockers.push({ code: "human_safety_gate", message: "Human consumption is blocked: edible condition and human verification are required." });
  }
  if (!finitePositive(recipient.capacity) && recipient.capacity !== 0) blockers.push({ code: "recipient_capacity_unknown", message: "Recipient capacity is invalid." });
  else if (offer.quantity > recipient.capacity) blockers.push({ code: "recipient_capacity", message: "Quantity exceeds available recipient capacity." });
  if (!transport.confirmed || !["available", "confirmed", "Available in demo"].includes(transport.status || transport.availability)) blockers.push({ code: "transport_unconfirmed", message: "Transport is not confirmed as available." });
  if (!finitePositive(transport.capacity)) blockers.push({ code: "transport_capacity_unknown", message: "Transport capacity is invalid." });
  else if (offer.quantity > transport.capacity) blockers.push({ code: "transport_capacity", message: "Quantity exceeds transport capacity." });

  const deadline = asTime(offer.deadline || offer.pickupDeadline);
  if (deadline === null) blockers.push({ code: "deadline_unknown", message: "Deadline date/time is pending confirmation." });
  else if (deadline <= now) blockers.push({ code: "deadline_passed", message: "The deadline has passed." });
  const recipientUntil = asTime(recipient.availableUntil || recipient.receivingUntil);
  const transportUntil = asTime(transport.availableUntil);

  let routeResult = null;
  if (route) {
    if (route.verified !== true || !route.provider || !Number.isFinite(route.distanceKm) || route.distanceKm < 0 || !Number.isFinite(route.durationMinutes) || route.durationMinutes < 0 || !Number.isFinite(route.estimatedArrivalAt)) {
      blockers.push({ code: "route_unverified", message: "The route requires distance and duration verified by a provider or human review." });
    } else {
      routeResult = { provider: route.provider, distanceKm: route.distanceKm, durationMinutes: route.durationMinutes, verified: true, verifiedAt: route.verifiedAt || null };
      if (deadline !== null && Number.isFinite(route.estimatedArrivalAt) && route.estimatedArrivalAt > deadline) blockers.push({ code: "route_late", message: "The verified estimated arrival would be after the deadline." });
      if (recipientUntil !== null && Number.isFinite(route.estimatedArrivalAt) && route.estimatedArrivalAt > recipientUntil) blockers.push({ code: "recipient_window", message: "The estimated arrival exceeds the confirmed receiving window." });
      if (transportUntil !== null && Number.isFinite(route.estimatedArrivalAt) && route.estimatedArrivalAt > transportUntil) blockers.push({ code: "transport_window", message: "The estimated arrival exceeds confirmed transport availability." });
    }
  } else {
    blockers.push({ code: "route_unverified", message: "The route must be verified before an operational assignment can be declared feasible." });
    warnings.push({ code: "route_not_requested", message: "Distance and duration were not estimated because no verified route is available." });
  }

  const eligible = blockers.length === 0;
  const scoreParts = {
    capacityFit: finitePositive(offer.quantity) && finitePositive(recipient.capacity) ? Math.min(1, recipient.capacity / offer.quantity) : 0,
    recipientConfirmation: recipient.confirmed ? 1 : 0,
    transportConfirmation: transport.confirmed ? 1 : 0,
    routeEfficiency: routeResult ? 1 / (1 + routeResult.distanceKm) : 0,
    timeSlack: routeResult && deadline !== null && Number.isFinite(route.estimatedArrivalAt) ? Math.max(0, Math.min(1, (deadline - route.estimatedArrivalAt) / Math.max(1, deadline - now))) : 0
  };
  const score = eligible ? Number((0.25 * scoreParts.capacityFit + 0.2 * scoreParts.recipientConfirmation + 0.2 * scoreParts.transportConfirmation + 0.2 * scoreParts.routeEfficiency + 0.15 * scoreParts.timeSlack).toFixed(5)) : null;
  return { eligible, score, scoreVersion: "grinflow-match-v1", blockers, warnings, route: routeResult, scoreParts };
}

/** @param {{ offer: any, recipients?: any[], transports?: any[], routesByPair?: Record<string, any>, now?: number }} input */
export function rankMatches({ offer, recipients = [], transports = [], routesByPair = {}, now = Date.now() }) {
  const candidates = [];
  for (const recipient of recipients) for (const transport of transports) {
    const key = `${recipient.id}:${transport.id}`;
    const assessment = evaluateMatch({ offer, recipient, transport, route: routesByPair[key] || null, now });
    candidates.push({ recipientId: recipient.id, recipientName: recipient.name, transportId: transport.id, transportName: transport.name, ...assessment });
  }
  return candidates.sort((a, b) => Number(b.eligible) - Number(a.eligible) || (b.score ?? -1) - (a.score ?? -1) || String(a.recipientName).localeCompare(String(b.recipientName)));
}
