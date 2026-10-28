/** Deterministic hard-gate matcher. Scores never override a blocker. */
export const recipients = [
  { id: "recip-a", name: "Comedor Comunitario La Esperanza", tier: "people", area: "Roma", routeKmFromRoma: 2.5, routeKmFromCentro: 4.2, categories: ["panificados", "frutas", "verduras", "abarrotes"], accepts: ["edible"], closesAt: 18, capacityUnits: 60, receivingConfirmed: true },
  { id: "recip-b", name: "Banco de Alimentos del Centro", tier: "people", area: "Centro", routeKmFromRoma: 4.8, routeKmFromCentro: 2.0, categories: ["panificados", "frutas", "verduras", "lacteos", "abarrotes", "proteina"], accepts: ["edible"], closesAt: 17, capacityUnits: 25, receivingConfirmed: true },
  { id: "recip-c", name: "Centro de Valorización Orgánica", tier: "valorization", area: "Roma", routeKmFromRoma: 3.1, routeKmFromCentro: 4.5, categories: ["panificados", "frutas", "verduras", "organico"], accepts: ["edible", "past_prime", "inedible"], closesAt: 20, capacityUnits: 100, receivingConfirmed: true }
];
export const capacities = [
  { id: "cap-a", name: "Unidad de reparto A · SIMULADA", confirmed: true, units: 50, availableUntil: 19 },
  { id: "cap-b", name: "Vehículo aliado B · NO CONFIRMADO", confirmed: false, units: 100, availableUntil: 21 }
];
export function evaluateCandidates(supply, recipientList = recipients, capacityList = capacities) {
  const results = [];
  for (const recipient of recipientList) for (const capacity of capacityList) {
    const blockers = [];
    if (!supply.category || !recipient.categories.includes(supply.category)) blockers.push({ code: "category_incompatible", label: "El destino no acepta esta categoría" });
    if (!recipient.accepts.includes(supply.condition || "unknown")) blockers.push({ code: "condition_not_accepted", label: "El destino no acepta la condición declarada" });
    if (recipient.tier === "people" && (supply.condition || "unknown") !== "edible") blockers.push({ code: "condition_not_safe_for_people", label: "Condición desconocida/no apta: bloqueado para consumo humano" });
    if (!Number.isFinite(supply.quantity) || supply.quantity <= 0) blockers.push({ code: "quantity_unknown", label: "Cantidad pendiente de confirmar" });
    if (Number.isFinite(supply.quantity) && recipient.capacityUnits < supply.quantity) blockers.push({ code: "recipient_capacity_low", label: "Capacidad de recepción insuficiente" });
    if (!supply.location) blockers.push({ code: "pickup_location_unknown", label: "Ubicación de recolección pendiente de confirmar" });
    const pickupArea = (supply.location || "").toLocaleLowerCase("es-MX");
    let routeKm = null;
    if (pickupArea.includes("roma")) routeKm = recipient.routeKmFromRoma;
    else if (pickupArea.includes("centro")) routeKm = recipient.routeKmFromCentro;
    if (supply.location && !Number.isFinite(routeKm)) blockers.push({ code: "route_unverified", label: "Ruta de recolección a destino no verificada en la demo" });
    if (Number.isFinite(routeKm) && routeKm > 35) blockers.push({ code: "detour_too_long", label: "Desvío estimado superior al límite de demo de 35 km" });
    if (supply.quantityBasis === "estimated") blockers.push({ code: "quantity_estimated", label: "Cantidad estimada; requiere confirmación" });
    if (!Number.isFinite(supply.deadlineHour)) blockers.push({ code: "deadline_unknown", label: "Hora límite pendiente de confirmar" });
    else if (recipient.closesAt < supply.deadlineHour) blockers.push({ code: "recipient_closes_early", label: "El destino cierra antes de la hora límite" });
    if (!capacity.confirmed) blockers.push({ code: "transport_unconfirmed", label: "Disponibilidad de transporte no confirmada" });
    if (Number.isFinite(supply.quantity) && capacity.units < supply.quantity) blockers.push({ code: "transport_capacity_low", label: "Capacidad de transporte insuficiente" });
    if (Number.isFinite(supply.deadlineHour) && capacity.availableUntil < supply.deadlineHour) blockers.push({ code: "transport_window_short", label: "La ventana de transporte termina antes del límite" });
    results.push({ recipientId: recipient.id, recipient: recipient.name, tier: recipient.tier, capacityId: capacity.id, capacity: `${capacity.name}${Number.isFinite(routeKm) ? ` · ruta sintética ${routeKm} km` : ""}`, routeKm, routeSource: Number.isFinite(routeKm) ? "synthetic_demo_assumption" : "unverified", feasible: blockers.length === 0, blockers });
  }
  return results.sort((a,b) => Number(b.feasible)-Number(a.feasible) || (a.tier === b.tier ? 0 : a.tier === "people" ? -1 : 1));
}
