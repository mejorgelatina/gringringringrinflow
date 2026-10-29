/** Deterministic hard-gate matcher. Scores never override a blocker. */
export const recipients = [
  { id: "recip-a", name: "La Esperanza Community Kitchen", tier: "people", area: "Roma", routeKmFromRoma: 2.5, routeKmFromCentro: 4.2, categories: ["panificados", "frutas", "verduras", "abarrotes"], accepts: ["edible"], closesAt: 18, capacityUnits: 60, receivingConfirmed: true },
  { id: "recip-b", name: "Centro Food Bank", tier: "people", area: "Centro", routeKmFromRoma: 4.8, routeKmFromCentro: 2.0, categories: ["panificados", "frutas", "verduras", "lacteos", "abarrotes", "proteina"], accepts: ["edible"], closesAt: 17, capacityUnits: 25, receivingConfirmed: true },
  { id: "recip-c", name: "Centro Organic Recovery Center", tier: "valorization", area: "Roma", routeKmFromRoma: 3.1, routeKmFromCentro: 4.5, categories: ["panificados", "frutas", "verduras", "organico"], accepts: ["edible", "past_prime", "inedible"], closesAt: 20, capacityUnits: 100, receivingConfirmed: true }
];
export const capacities = [
  { id: "cap-a", name: "Delivery Vehicle A · SIMULATED", confirmed: true, units: 50, availableUntil: 19 },
  { id: "cap-b", name: "Partner Vehicle B · UNCONFIRMED", confirmed: false, units: 100, availableUntil: 21 }
];
export function evaluateCandidates(supply, recipientList = recipients, capacityList = capacities) {
  const results = [];
  for (const recipient of recipientList) for (const capacity of capacityList) {
    const blockers = [];
    if (!supply.category || !recipient.categories.includes(supply.category)) blockers.push({ code: "category_incompatible", label: "The recipient does not accept this category" });
    if (!recipient.accepts.includes(supply.condition || "unknown")) blockers.push({ code: "condition_not_accepted", label: "The recipient does not accept the declared condition" });
    if (recipient.tier === "people" && (supply.condition || "unknown") !== "edible") blockers.push({ code: "condition_not_safe_for_people", label: "Unknown/unsuitable condition: blocked for human consumption" });
    if (!Number.isFinite(supply.quantity) || supply.quantity <= 0) blockers.push({ code: "quantity_unknown", label: "Quantity pending confirmation" });
    if (Number.isFinite(supply.quantity) && recipient.capacityUnits < supply.quantity) blockers.push({ code: "recipient_capacity_low", label: "Receiving capacity is insufficient" });
    if (!supply.location) blockers.push({ code: "pickup_location_unknown", label: "Pickup location pending confirmation" });
    const pickupArea = (supply.location || "").toLocaleLowerCase("es-MX");
    let routeKm = null;
    if (pickupArea.includes("roma")) routeKm = recipient.routeKmFromRoma;
    else if (pickupArea.includes("centro")) routeKm = recipient.routeKmFromCentro;
    if (supply.location && !Number.isFinite(routeKm)) blockers.push({ code: "route_unverified", label: "Pickup-to-recipient route is not verified in this demo" });
    if (Number.isFinite(routeKm) && routeKm > 35) blockers.push({ code: "detour_too_long", label: "Estimated detour exceeds the 35 km demo limit" });
    if (supply.quantityBasis === "estimated") blockers.push({ code: "quantity_estimated", label: "Quantity is estimated; confirmation required" });
    if (!Number.isFinite(supply.deadlineHour)) blockers.push({ code: "deadline_unknown", label: "Deadline pending confirmation" });
    else if (recipient.closesAt < supply.deadlineHour) blockers.push({ code: "recipient_closes_early", label: "The recipient closes before the deadline" });
    if (!capacity.confirmed) blockers.push({ code: "transport_unconfirmed", label: "Transport availability is not confirmed" });
    if (Number.isFinite(supply.quantity) && capacity.units < supply.quantity) blockers.push({ code: "transport_capacity_low", label: "Transport capacity is insufficient" });
    if (Number.isFinite(supply.deadlineHour) && capacity.availableUntil < supply.deadlineHour) blockers.push({ code: "transport_window_short", label: "The transport window ends before the deadline" });
    results.push({ recipientId: recipient.id, recipient: recipient.name, tier: recipient.tier, capacityId: capacity.id, capacity: `${capacity.name}${Number.isFinite(routeKm) ? ` · synthetic route ${routeKm} km` : ""}`, routeKm, routeSource: Number.isFinite(routeKm) ? "synthetic_demo_assumption" : "unverified", feasible: blockers.length === 0, blockers });
  }
  return results.sort((a,b) => Number(b.feasible)-Number(a.feasible) || (a.tier === b.tier ? 0 : a.tier === "people" ? -1 : 1));
}
