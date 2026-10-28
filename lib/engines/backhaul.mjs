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
    return { feasible: false, blockers: [block("missing_inputs", "Se requieren viaje, oferta, destino y estimación de ruta.")], warnings, score: null };
  }
  if (trip.vehicleConfirmed !== true) blockers.push(block("vehicle_unconfirmed", "La unidad/conductor no confirmó el viaje ni su disponibilidad."));
  if (trip.originalDeliveryConfirmed !== true) blockers.push(block("first_drop_unconfirmed", "La primera entrega debe estar confirmada antes de planear un retorno."));
  if (!Number.isFinite(trip.capacity) || trip.capacity <= 0) blockers.push(block("capacity_unknown", "Capacidad útil del vehículo no confirmada."));
  if (!Number.isFinite(trip.loadAfterDropoff) || trip.loadAfterDropoff < 0) blockers.push(block("load_unknown", "Carga remanente después de la entrega no confirmada."));
  if (!Number.isFinite(offer.quantity) || offer.quantity <= 0 || offer.quantityConfirmed !== true) blockers.push(block("offer_quantity_unconfirmed", "La cantidad de la oferta debe confirmarse."));
  if (Number.isFinite(trip.capacity) && Number.isFinite(trip.loadAfterDropoff) && Number.isFinite(offer.quantity) && trip.loadAfterDropoff + offer.quantity > trip.capacity) blockers.push(block("vehicle_capacity", "La carga existente más el excedente supera la capacidad disponible."));
  if (offer.donorConfirmed !== true || offer.shareConsent !== true) blockers.push(block("donor_consent", "El donante debe confirmar la oferta y autorizar compartir los datos necesarios."));
  if (recipient.confirmed !== true) blockers.push(block("recipient_unconfirmed", "El destino de la segunda entrega no está confirmado."));
  if (!Array.isArray(recipient.categories) || !recipient.categories.includes(offer.category)) blockers.push(block("category_mismatch", "El destino no acepta esta categoría."));
  if (!Array.isArray(recipient.conditionPolicy) || !recipient.conditionPolicy.includes(offer.condition)) blockers.push(block("condition_policy", "La condición declarada no cumple la política del destino."));
  const intendedUse = recipient.intendedUse || recipient.type || "";
  if (/human_consumption|consumo humano|people/i.test(intendedUse) && (offer.condition !== "edible" || offer.conditionConfirmed !== true)) blockers.push(block("food_safety", "Consumo humano requiere condición comestible y confirmación humana independiente."));

  const deadline = parseTime(offer.deadline);
  const tripEnd = parseTime(trip.availableUntil);
  const pickupAt = parseTime(route.pickupEta);
  const deliveryAt = parseTime(route.deliveryEta);
  if (deadline === null) blockers.push(block("deadline_unknown", "La oferta no tiene una hora límite válida."));
  else if (deadline <= now) blockers.push(block("deadline_passed", "La oferta ya venció."));
  if (tripEnd === null) blockers.push(block("trip_window_unknown", "No está confirmada la ventana de disponibilidad del viaje."));
  if (pickupAt === null || deliveryAt === null) blockers.push(block("eta_unknown", "Se requieren ETA de recolección y entrega."));
  else {
    if (deadline !== null && pickupAt > deadline) blockers.push(block("pickup_late", "La recolección llegaría después del límite."));
    if (tripEnd !== null && deliveryAt > tripEnd) blockers.push(block("trip_window_exceeded", "La segunda entrega excede la ventana disponible del vehículo."));
  }
  if (route.verified !== true || !route.provider || !Number.isFinite(route.incrementalKm) || route.incrementalKm < 0 || !Number.isFinite(route.emptyKmAvoided) || route.emptyKmAvoided < 0 || !Number.isFinite(route.incrementalMinutes) || route.incrementalMinutes < 0) {
    blockers.push(block("route_unverified", "El desvío y los kilómetros vacíos evitados deben venir de una ruta verificada."));
  }
  const netKmBenefit = route.verified === true && Number.isFinite(route.emptyKmAvoided) && Number.isFinite(route.incrementalKm) ? Number((route.emptyKmAvoided - route.incrementalKm).toFixed(2)) : null;
  if (netKmBenefit !== null && netKmBenefit <= 0) blockers.push(block("no_net_route_benefit", "El desvío no reduce kilómetros netos frente al retorno base."));
  if (trip.transportPermissionConfirmed !== true) blockers.push(block("transport_terms_unconfirmed", "Debe confirmarse que las condiciones del transportista/plataforma permiten este tipo de carga."));

  const feasible = blockers.length === 0;
  const score = feasible ? Number(Math.min(1, netKmBenefit / Math.max(1, route.emptyKmAvoided)).toFixed(5)) : null;
  if (feasible) warnings.push(block("human_dispatch_required", "Oportunidad calculada; requiere aprobación humana antes de contactar al conductor o ejecutar la ruta."));
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
