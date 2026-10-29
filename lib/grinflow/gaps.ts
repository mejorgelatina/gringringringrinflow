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
  { id: "edible", label: "Edible", effect: "provide_information" },
  { id: "past_prime", label: "Past its prime", effect: "provide_information" },
  { id: "inedible", label: "Not edible", effect: "provide_information" },
  { id: "unknown", label: "I don't know", effect: "provide_information" },
]
export const CONFIRM_RESPONSES: AllowedResponse[] = [
  { id: "confirm", label: "Yes, that's right", effect: "confirm_information" },
  { id: "reject", label: "No, it needs correcting", effect: "reject_information" },
]
// Free answers travel in the response text; the value is parsed by the flow.
export const VALUE_RESPONSES: AllowedResponse[] = [{ id: "provide_value", label: "Send value", effect: "provide_information" }]

const LABELS: Record<OfferFieldName, string> = {
  product: "the product",
  category: "the category",
  quantity: "the quantity",
  unit: "the unit",
  weightKg: "the approximate weight in kg",
  condition: "the product condition",
  pickupLocation: "the pickup location",
  pickupWindow: "the pickup window",
}

const CLARIFY_QUESTIONS: Record<OfferFieldName, string> = {
  product: "What product are you offering?",
  category: "Which category is it? (panificados, verduras, frutas, lacteos, abarrotes, proteina, organico)",
  quantity: "How many units are there?",
  unit: "In what unit? (boxes, kg, pieces, bags)",
  weightKg: "Roughly how much does it weigh in total, in kg?",
  condition: "What condition is the product in?",
  pickupLocation: "Where is the pickup? (lat,lng)",
  pickupWindow: "When can it be picked up? (HH:MM-HH:MM)",
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
        question: `Can you confirm ${LABELS[field]}: ${formatValue(field, tracked.value)}?`,
        allowedResponses: CONFIRM_RESPONSES,
      })
    }
  }
  return gaps
}
