import type { AllowedResponse, Offer, OfferFieldName, Role } from "./types.ts"

// Fields the matching engine needs before any destination can be proposed.
export const REQUIRED_FIELDS: OfferFieldName[] = [
  "product",
  "category",
  "quantity",
  "unit",
  "weightKg",
  "condition",
  "pickupLocation",
  "pickupWindow",
]

// A value read from a message is not enough for these: the donor must confirm it.
export const CRITICAL_FIELDS: OfferFieldName[] = ["quantity", "weightKg", "condition", "pickupWindow"]

export type Gap = {
  field: OfferFieldName
  kind: "clarify" | "confirm"
  targetRole: Role
  question: string
  allowedResponses: AllowedResponse[]
}

export const CONDITION_RESPONSES: AllowedResponse[] = [
  { id: "edible", label: "Apto para consumo", effect: "provide_information" },
  { id: "past_prime", label: "Pasado de su mejor momento", effect: "provide_information" },
  { id: "inedible", label: "No apto para consumo", effect: "provide_information" },
  { id: "unknown", label: "No lo sé", effect: "provide_information" },
]
export const CONFIRM_RESPONSES: AllowedResponse[] = [
  { id: "confirm", label: "Sí, es correcto", effect: "confirm_information" },
  { id: "reject", label: "No, hay que corregirlo", effect: "reject_information" },
]
// Free answers travel in the response text; the value is parsed by the flow.
export const VALUE_RESPONSES: AllowedResponse[] = [{ id: "provide_value", label: "Enviar dato", effect: "provide_information" }]

const LABELS: Record<OfferFieldName, string> = {
  product: "el producto",
  category: "la categoría",
  quantity: "la cantidad",
  unit: "la unidad",
  weightKg: "el peso aproximado en kg",
  condition: "el estado del producto",
  pickupLocation: "la ubicación de recogida",
  pickupWindow: "el horario de recogida",
}

const CLARIFY_QUESTIONS: Record<OfferFieldName, string> = {
  product: "¿Qué producto estás ofreciendo?",
  category: "¿A qué categoría pertenece? (panificados, verduras, frutas, lacteos, abarrotes, proteina, organico)",
  quantity: "¿Cuántas unidades hay?",
  unit: "¿En qué unidad? (cajas, kg, piezas, bolsas)",
  weightKg: "¿Cuánto pesa en total, aproximadamente, en kg?",
  condition: "¿En qué estado está el producto?",
  pickupLocation: "¿Dónde se recoge? (lat,lng)",
  pickupWindow: "¿En qué horario se puede recoger? (HH:MM-HH:MM)",
}

function formatValue(field: OfferFieldName, value: unknown): string {
  if (field === "pickupWindow" && value && typeof value === "object") {
    const w = value as { start: string; end: string }
    return `${w.start.slice(11, 16)}–${w.end.slice(11, 16)}`
  }
  return String(value)
}

export function identifyGaps(offer: Offer): Gap[] {
  const gaps: Gap[] = []
  for (const field of REQUIRED_FIELDS) {
    const tracked = offer[field]
    if (tracked.status === "missing" || tracked.value === null) {
      gaps.push({
        field,
        kind: "clarify",
        targetRole: "donor",
        question: CLARIFY_QUESTIONS[field],
        allowedResponses: field === "condition" ? CONDITION_RESPONSES : VALUE_RESPONSES,
      })
    } else if (tracked.status === "reported" && CRITICAL_FIELDS.includes(field)) {
      gaps.push({
        field,
        kind: "confirm",
        targetRole: "donor",
        question: `¿Confirmas ${LABELS[field]}: ${formatValue(field, tracked.value)}?`,
        allowedResponses: CONFIRM_RESPONSES,
      })
    }
  }
  return gaps
}
