/** GrinFlow logistics domain core. All seeded records are synthetic. */
export const OPERATION_STATUSES = ["draft", "needs_review", "ready_to_match", "proposed", "approved", "assigned", "picked_up", "delivered", "cancelled"];
export const STATUS_LABELS = {
  draft: "Borrador", needs_review: "Requiere revisión", ready_to_match: "Lista para buscar destino", proposed: "Propuesta enviada", approved: "Aprobada", assigned: "Transporte asignado", picked_up: "Recogida registrada", delivered: "Entrega registrada", cancelled: "Cancelada"
};
export const SEED_STATE = {
  schemaVersion: 1,
  operations: [
    { id: "GF-1024", title: "Panadería · excedente de pan", donor: "Panadería La Roma (simulada)", item: "Pan surtido", category: "panificados", quantity: 20, unit: "cajas", quantityConfirmed: true, condition: "edible", conditionConfirmed: false, pickupLocation: "Colonia Roma, CDMX", deadline: "2026-10-28T18:00:00-06:00", recipientId: "recipient-1", vehicleId: "vehicle-1", status: "proposed", source: "Mensaje de WhatsApp copiado manualmente (simulado)", evidence: "Tenemos 20 cajas de pan fresco en la colonia Roma, hay que recogerlas antes de las 6 pm.", createdAt: "2026-10-28T08:00:00-06:00", notes: "Escenario sintético; confirmar condición, ventana y responsables antes de cualquier operación real." },
    { id: "GF-1025", title: "Fruta madura · mercado", donor: "Comerciante del mercado (simulado)", item: "Fruta mixta", category: "frutas", quantity: 12, unit: "cajas", quantityConfirmed: false, condition: "past_prime", conditionConfirmed: false, pickupLocation: "Centro, CDMX", deadline: "2026-10-28T15:00:00-06:00", recipientId: "recipient-3", vehicleId: null, status: "needs_review", source: "Registro manual sintético", evidence: "Nos quedan como 12 cajas de fruta muy madura en el Centro; ¿alguien puede pasar hoy?", createdAt: "2026-10-28T08:10:00-06:00", notes: "Cantidad estimada y sin transporte confirmado; no disponible para consumo humano." },
    { id: "GF-1026", title: "Verduras · oferta incompleta", donor: "Proveedor local (simulado)", item: "Verduras mixtas", category: "verduras", quantity: null, unit: "cajas", quantityConfirmed: false, condition: "unknown", conditionConfirmed: false, pickupLocation: "", deadline: null, recipientId: null, vehicleId: null, status: "draft", source: "Registro manual sintético", evidence: "Tengo verduras que me sobraron, ¿les sirven?", createdAt: "2026-10-28T08:20:00-06:00", notes: "Faltan cantidad, condición, ubicación y horario. No se puede proponer un destino." }
  ],
  recipients: [
    { id: "recipient-1", name: "Comedor Comunitario La Esperanza (simulado)", type: "Consumo humano", categories: ["panificados", "frutas", "verduras", "abarrotes"], capacity: 30, area: "Roma", conditionPolicy: ["edible"], receivingWindow: "10:00–18:00", confirmed: true },
    { id: "recipient-2", name: "Banco de Alimentos del Centro (simulado)", type: "Consumo humano", categories: ["panificados", "frutas", "verduras", "lacteos", "abarrotes", "proteina"], capacity: 25, area: "Centro", conditionPolicy: ["edible"], receivingWindow: "09:00–17:00", confirmed: true },
    { id: "recipient-3", name: "Centro de Valorización Orgánica (simulado)", type: "Valorización", categories: ["panificados", "frutas", "verduras", "organico"], capacity: 100, area: "Centro", conditionPolicy: ["edible", "past_prime", "inedible"], receivingWindow: "08:00–20:00", confirmed: true }
  ],
  vehicles: [
    { id: "vehicle-1", name: "Unidad de reparto A (simulada)", capacity: 25, area: "Roma", availability: "Disponible en demo", confirmed: true, driver: "Operador sintético", temperatureControl: "No verificado" },
    { id: "vehicle-2", name: "Vehículo aliado B (no confirmado)", capacity: 100, area: "Centro", availability: "Por confirmar", confirmed: false, driver: "Sin confirmar", temperatureControl: "Desconocido" }
  ],
  audit: [ { id: "audit-seed", at: "2026-10-28T08:00:00-06:00", operationId: null, action: "demo_initialized", actor: "Sistema", detail: "Se cargaron registros sintéticos de demostración; no hay operaciones reales." } ]
};

export function assessOperation(operation, recipient, vehicle) {
  const blockers = [];
  if (!operation.category) blockers.push("Categoría del producto pendiente");
  if (!Number.isFinite(operation.quantity) || operation.quantity <= 0) blockers.push("Cantidad pendiente");
  if (!operation.quantityConfirmed) blockers.push("Cantidad no confirmada");
  if (!operation.condition || operation.condition === "unknown") blockers.push("Condición declarada pendiente de revisión");
  if (!operation.conditionConfirmed) blockers.push("Condición no confirmada por una persona autorizada");
  if (!operation.pickupLocation) blockers.push("Ubicación de recolección pendiente");
  if (!operation.deadline) blockers.push("Horario límite pendiente");
  if (!recipient) blockers.push("Destino no seleccionado");
  if (recipient) {
    if (!recipient.confirmed) blockers.push("Destino no confirmado");
    if (!recipient.categories.includes(operation.category)) blockers.push("Destino no acepta esta categoría");
    if (!recipient.conditionPolicy.includes(operation.condition)) blockers.push("Política del destino incompatible con la condición declarada");
    if (Number.isFinite(operation.quantity) && operation.quantity > recipient.capacity) blockers.push("Capacidad del destino insuficiente");
    if (recipient.type === "Consumo humano" && operation.condition !== "edible") blockers.push("Condición no apta/verificada para consumo humano; bloqueado");
  }
  if (!vehicle) blockers.push("Transporte no asignado");
  if (vehicle) {
    if (!vehicle.confirmed) blockers.push("Transporte no confirmado");
    if (Number.isFinite(operation.quantity) && operation.quantity > vehicle.capacity) blockers.push("Capacidad del transporte insuficiente");
  }
  return { feasible: blockers.length === 0, blockers };
}

const ALLOWED = {
  draft: ["needs_review", "ready_to_match", "cancelled"],
  needs_review: ["draft", "ready_to_match", "cancelled"],
  ready_to_match: ["needs_review", "proposed", "cancelled"],
  proposed: ["ready_to_match", "approved", "cancelled"],
  approved: ["proposed", "assigned", "cancelled"],
  assigned: ["approved", "picked_up", "cancelled"],
  picked_up: ["assigned", "delivered", "cancelled"],
  delivered: [], cancelled: []
};

export function transitionOperation(state, operationId, nextStatus, actor = "Operador demo") {
  const operation = state.operations.find(item => item.id === operationId);
  if (!operation) return { ok: false, error: "Operación no encontrada", state };
  if (!ALLOWED[operation.status]?.includes(nextStatus)) return { ok: false, error: `Transición no permitida: ${STATUS_LABELS[operation.status]} → ${STATUS_LABELS[nextStatus] || nextStatus}`, state };
  if (nextStatus === "ready_to_match") {
    const missing = [];
    if (!operation.category) missing.push("categoría");
    if (!Number.isFinite(operation.quantity) || operation.quantity <= 0) missing.push("cantidad");
    if (!operation.quantityConfirmed) missing.push("confirmación de cantidad");
    if (!operation.condition || operation.condition === "unknown") missing.push("condición declarada");
    if (!operation.conditionConfirmed) missing.push("confirmación humana de condición");
    if (!operation.pickupLocation) missing.push("ubicación");
    if (!operation.deadline) missing.push("fecha/hora límite");
    if (missing.length) return { ok: false, error: `No se puede pasar a matching: falta ${missing.join(", ")}.`, state, blockers: missing };
  }
  if (["proposed", "approved", "assigned", "picked_up", "delivered"].includes(nextStatus)) {
    const recipient = state.recipients.find(item => item.id === operation.recipientId);
    const vehicle = state.vehicles.find(item => item.id === operation.vehicleId);
    const assessment = assessOperation(operation, recipient, vehicle);
    if (!assessment.feasible) return { ok: false, error: `No se puede avanzar: ${assessment.blockers.join("; ")}`, state, blockers: assessment.blockers };
  }
  const at = new Date().toISOString();
  const updated = { ...operation, status: nextStatus, updatedAt: at };
  const audit = { id: `audit-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, at, operationId, action: "status_changed", actor, detail: `${STATUS_LABELS[operation.status]} → ${STATUS_LABELS[nextStatus]} · demo solamente` };
  return { ok: true, state: { ...state, operations: state.operations.map(item => item.id === operationId ? updated : item), audit: [audit, ...state.audit] } };
}

export function updateOperation(state, operationId, patch, actor = "Operador demo") {
  const current = state.operations.find(item => item.id === operationId);
  if (!current) return { ok: false, error: "Operación no encontrada", state };
  if (["approved", "assigned", "picked_up", "delivered", "cancelled"].includes(current.status)) return { ok: false, error: "Los campos operativos quedan bloqueados en este estado. Registra una corrección auditada o reabre el flujo permitido.", state };
  const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
  const at = new Date().toISOString();
  const previous = Object.fromEntries(Object.keys(patch).map(key => [key, current[key]]));
  const audit = { id: `audit-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, at, operationId, action: "operation_corrected", actor, detail: `Campos actualizados: ${JSON.stringify({ before: previous, after: patch })}` };
  return { ok: true, state: { ...state, operations: state.operations.map(item => item.id === operationId ? updated : item), audit: [audit, ...state.audit] } };
}
