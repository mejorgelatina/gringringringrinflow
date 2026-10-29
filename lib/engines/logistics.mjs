/** GrinFlow logistics domain core. All seeded records are synthetic. */
export const OPERATION_STATUSES = ["draft", "needs_review", "ready_to_match", "proposed", "approved", "assigned", "picked_up", "delivered", "cancelled"];
export const STATUS_LABELS = {
  draft: "Draft", needs_review: "Needs review", ready_to_match: "Ready to match", proposed: "Proposal submitted", approved: "Approved", assigned: "Transport assigned", picked_up: "Pickup recorded", delivered: "Delivery recorded", cancelled: "Cancelled"
};
/** @type {Record<string, string>} */
export const CATEGORY_LABELS = {
  panificados: "Bakery goods", frutas: "Fruit", verduras: "Vegetables", lacteos: "Dairy", abarrotes: "Groceries", proteina: "Protein", organico: "Organic"
};
export const SEED_STATE = {
  schemaVersion: 1,
  operations: [
    { id: "GF-1024", title: "Bakery · surplus bread", donor: "La Roma Bakery (simulated)", item: "Assorted bread", category: "panificados", quantity: 20, unit: "boxes", quantityConfirmed: true, condition: "edible", conditionConfirmed: false, pickupLocation: "Colonia Roma, CDMX", deadline: "2026-10-28T18:00:00-06:00", recipientId: "recipient-1", vehicleId: "vehicle-1", status: "proposed", source: "Manually copied WhatsApp message (simulated)", evidence: "Tenemos 20 cajas de pan fresco en la colonia Roma, hay que recogerlas antes de las 6 pm.", createdAt: "2026-10-28T08:00:00-06:00", notes: "Synthetic scenario; confirm condition, time window, and responsible parties before any real operation." },
    { id: "GF-1025", title: "Ripe fruit · market", donor: "Market vendor (simulated)", item: "Mixed fruit", category: "frutas", quantity: 12, unit: "boxes", quantityConfirmed: false, condition: "past_prime", conditionConfirmed: false, pickupLocation: "Centro, CDMX", deadline: "2026-10-28T15:00:00-06:00", recipientId: "recipient-3", vehicleId: null, status: "needs_review", source: "Synthetic manual record", evidence: "Nos quedan como 12 cajas de fruta muy madura en el Centro; ¿alguien puede pasar hoy?", createdAt: "2026-10-28T08:10:00-06:00", notes: "Quantity is estimated and transport is unconfirmed; not available for human consumption." },
    { id: "GF-1026", title: "Vegetables · incomplete offer", donor: "Local supplier (simulated)", item: "Mixed vegetables", category: "verduras", quantity: null, unit: "boxes", quantityConfirmed: false, condition: "unknown", conditionConfirmed: false, pickupLocation: "", deadline: null, recipientId: null, vehicleId: null, status: "draft", source: "Synthetic manual record", evidence: "Tengo verduras que me sobraron, ¿les sirven?", createdAt: "2026-10-28T08:20:00-06:00", notes: "Quantity, condition, location, and time are missing. A recipient cannot be proposed." }
  ],
  recipients: [
    { id: "recipient-1", name: "La Esperanza Community Kitchen (simulated)", type: "Human consumption", categories: ["panificados", "frutas", "verduras", "abarrotes"], capacity: 30, area: "Roma", conditionPolicy: ["edible"], receivingWindow: "10:00–18:00", confirmed: true },
    { id: "recipient-2", name: "Centro Food Bank (simulated)", type: "Human consumption", categories: ["panificados", "frutas", "verduras", "lacteos", "abarrotes", "proteina"], capacity: 25, area: "Centro", conditionPolicy: ["edible"], receivingWindow: "09:00–17:00", confirmed: true },
    { id: "recipient-3", name: "Centro Organic Recovery Center (simulated)", type: "Material recovery", categories: ["panificados", "frutas", "verduras", "organico"], capacity: 100, area: "Centro", conditionPolicy: ["edible", "past_prime", "inedible"], receivingWindow: "08:00–20:00", confirmed: true }
  ],
  vehicles: [
    { id: "vehicle-1", name: "Delivery Vehicle A (simulated)", capacity: 25, area: "Roma", availability: "Available in demo", confirmed: true, driver: "Synthetic operator", temperatureControl: "Unverified" },
    { id: "vehicle-2", name: "Partner Vehicle B (unconfirmed)", capacity: 100, area: "Centro", availability: "Pending confirmation", confirmed: false, driver: "Unconfirmed", temperatureControl: "Unknown" }
  ],
  audit: [{ id: "audit-seed", at: "2026-10-28T08:00:00-06:00", operationId: null, action: "demo_initialized", actor: "System", detail: "Synthetic demo records loaded; no real-world operations." }]
};

export function assessOperation(operation, recipient, vehicle) {
  const blockers = [];
  if (!operation.category) blockers.push("Product category is missing");
  if (!Number.isFinite(operation.quantity) || operation.quantity <= 0) blockers.push("Quantity is missing or invalid");
  if (!operation.quantityConfirmed) blockers.push("Quantity is not confirmed");
  if (!operation.condition || operation.condition === "unknown") blockers.push("Declared condition needs review");
  if (!operation.conditionConfirmed) blockers.push("Condition has not been confirmed by an authorized person");
  if (!operation.pickupLocation) blockers.push("Pickup location is missing");
  if (!operation.deadline) blockers.push("Deadline is missing");
  if (!recipient) blockers.push("No recipient selected");
  if (recipient) {
    if (!recipient.confirmed) blockers.push("Recipient is not confirmed");
    if (!recipient.categories.includes(operation.category)) blockers.push("Recipient does not accept this category");
    if (!recipient.conditionPolicy.includes(operation.condition)) blockers.push("Recipient condition policy is incompatible with the declared condition");
    if (Number.isFinite(operation.quantity) && operation.quantity > recipient.capacity) blockers.push("Recipient capacity is insufficient");
    if (recipient.type === "Human consumption" && operation.condition !== "edible") blockers.push("Condition is not verified as suitable for human consumption; blocked");
  }
  if (!vehicle) blockers.push("No transport selected");
  if (vehicle) {
    if (!vehicle.confirmed) blockers.push("Transport is not confirmed");
    if (Number.isFinite(operation.quantity) && operation.quantity > vehicle.capacity) blockers.push("Transport capacity is insufficient");
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

export function transitionOperation(state, operationId, nextStatus, actor = "Demo operator") {
  const operation = state.operations.find(item => item.id === operationId);
  if (!operation) return { ok: false, error: "Operation not found", state };
  if (!ALLOWED[operation.status]?.includes(nextStatus)) return { ok: false, error: `Transition not allowed: ${STATUS_LABELS[operation.status]} → ${STATUS_LABELS[nextStatus] || nextStatus}`, state };
  if (nextStatus === "ready_to_match") {
    const missing = [];
    if (!operation.category) missing.push("category");
    if (!Number.isFinite(operation.quantity) || operation.quantity <= 0) missing.push("positive quantity");
    if (!operation.quantityConfirmed) missing.push("quantity confirmation");
    if (!operation.condition || operation.condition === "unknown") missing.push("declared condition");
    if (!operation.conditionConfirmed) missing.push("human condition confirmation");
    if (!operation.pickupLocation) missing.push("pickup location");
    if (!operation.deadline) missing.push("deadline");
    if (missing.length) return { ok: false, error: `Cannot proceed to matching; missing ${missing.join(", ")}.`, state, blockers: missing };
  }
  if (["proposed", "approved", "assigned", "picked_up", "delivered"].includes(nextStatus)) {
    const recipient = state.recipients.find(item => item.id === operation.recipientId);
    const vehicle = state.vehicles.find(item => item.id === operation.vehicleId);
    const assessment = assessOperation(operation, recipient, vehicle);
    if (!assessment.feasible) return { ok: false, error: `Cannot proceed: ${assessment.blockers.join("; ")}`, state, blockers: assessment.blockers };
  }
  const at = new Date().toISOString();
  const updated = { ...operation, status: nextStatus, updatedAt: at };
  const audit = { id: `audit-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, at, operationId, action: "status_changed", actor, detail: `${STATUS_LABELS[operation.status]} → ${STATUS_LABELS[nextStatus]} · demo only` };
  return { ok: true, state: { ...state, operations: state.operations.map(item => item.id === operationId ? updated : item), audit: [audit, ...state.audit] } };
}

export function updateOperation(state, operationId, patch, actor = "Demo operator") {
  const current = state.operations.find(item => item.id === operationId);
  if (!current) return { ok: false, error: "Operation not found", state };
  if (["approved", "assigned", "picked_up", "delivered", "cancelled"].includes(current.status)) return { ok: false, error: "Operational fields are locked in this state. Record an audited correction or reopen the permitted workflow.", state };
  const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
  const at = new Date().toISOString();
  const previous = Object.fromEntries(Object.keys(patch).map(key => [key, current[key]]));
  const audit = { id: `audit-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, at, operationId, action: "operation_corrected", actor, detail: `Fields updated: ${JSON.stringify({ before: previous, after: patch })}` };
  return { ok: true, state: { ...state, operations: state.operations.map(item => item.id === operationId ? updated : item), audit: [audit, ...state.audit] } };
}
