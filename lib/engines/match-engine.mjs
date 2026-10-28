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
    return { eligible: false, score: null, blockers: [{ code: "missing_candidate", message: "Oferta, destino y transporte son obligatorios para evaluar un candidato." }], warnings, route: null };
  }

  if (!offer.category || !Array.isArray(recipient.categories) || !recipient.categories.includes(offer.category)) blockers.push({ code: "category_mismatch", message: "El destino no acepta la categoría." });
  if (!finitePositive(offer.quantity)) blockers.push({ code: "quantity_missing", message: "La cantidad debe ser positiva y conocida." });
  if (offer.quantityBasis !== "confirmed" && offer.quantityConfirmed !== true) blockers.push({ code: "quantity_unconfirmed", message: "La cantidad requiere confirmación humana." });
  if (!offer.unit || !transport.unit || offer.unit !== transport.unit) blockers.push({ code: "unit_mismatch", message: "Las unidades de oferta y transporte deben coincidir o convertirse explícitamente." });
  if (!recipient.confirmed || recipient.status === "unconfirmed") blockers.push({ code: "recipient_unconfirmed", message: "La capacidad o disponibilidad del destino no está confirmada." });
  if (!Array.isArray(recipient.conditionPolicy) || !recipient.conditionPolicy.includes(offer.condition)) blockers.push({ code: "condition_policy", message: "La condición declarada no cumple la política del destino." });
  const intendedUse = recipient.intendedUse || recipient.type || "";
  if ((HUMAN_USES.has(intendedUse) || /consumo humano/i.test(intendedUse)) && (offer.condition !== "edible" || offer.conditionConfirmed !== true)) {
    blockers.push({ code: "human_safety_gate", message: "Consumo humano bloqueado: condición comestible y verificación humana obligatorias." });
  }
  if (!finitePositive(recipient.capacity) && recipient.capacity !== 0) blockers.push({ code: "recipient_capacity_unknown", message: "Capacidad del destino no válida." });
  else if (offer.quantity > recipient.capacity) blockers.push({ code: "recipient_capacity", message: "La cantidad supera la capacidad disponible del destino." });
  if (!transport.confirmed || !["available", "confirmed", "Disponible en demo"].includes(transport.status || transport.availability)) blockers.push({ code: "transport_unconfirmed", message: "El transporte no está confirmado como disponible." });
  if (!finitePositive(transport.capacity)) blockers.push({ code: "transport_capacity_unknown", message: "Capacidad de transporte no válida." });
  else if (offer.quantity > transport.capacity) blockers.push({ code: "transport_capacity", message: "La cantidad supera la capacidad del transporte." });

  const deadline = asTime(offer.deadline || offer.pickupDeadline);
  if (deadline === null) blockers.push({ code: "deadline_unknown", message: "Fecha/hora límite pendiente de confirmar." });
  else if (deadline <= now) blockers.push({ code: "deadline_passed", message: "La fecha/hora límite ya pasó." });
  const recipientUntil = asTime(recipient.availableUntil || recipient.receivingUntil);
  const transportUntil = asTime(transport.availableUntil);

  let routeResult = null;
  if (route) {
    if (route.verified !== true || !route.provider || !Number.isFinite(route.distanceKm) || route.distanceKm < 0 || !Number.isFinite(route.durationMinutes) || route.durationMinutes < 0 || !Number.isFinite(route.estimatedArrivalAt)) {
      blockers.push({ code: "route_unverified", message: "La ruta requiere distancia y duración verificadas por un proveedor o revisión humana." });
    } else {
      routeResult = { provider: route.provider, distanceKm: route.distanceKm, durationMinutes: route.durationMinutes, verified: true, verifiedAt: route.verifiedAt || null };
      if (deadline !== null && Number.isFinite(route.estimatedArrivalAt) && route.estimatedArrivalAt > deadline) blockers.push({ code: "route_late", message: "La llegada estimada verificada sería posterior al límite." });
      if (recipientUntil !== null && Number.isFinite(route.estimatedArrivalAt) && route.estimatedArrivalAt > recipientUntil) blockers.push({ code: "recipient_window", message: "La llegada estimada excede la ventana de recepción confirmada." });
      if (transportUntil !== null && Number.isFinite(route.estimatedArrivalAt) && route.estimatedArrivalAt > transportUntil) blockers.push({ code: "transport_window", message: "La llegada estimada excede la disponibilidad confirmada del transporte." });
    }
  } else {
    blockers.push({ code: "route_unverified", message: "La ruta debe verificarse antes de declarar viable una asignación operativa." });
    warnings.push({ code: "route_not_requested", message: "No se estimó distancia ni duración porque no existe una ruta verificada." });
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
