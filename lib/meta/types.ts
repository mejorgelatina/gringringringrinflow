import { z } from "zod";

export const EventSchema = z.object({
  kind: z.enum(["supply_announced", "demand_declared", "capacity_offered", "constraint_reported", "status_update", "correction", "unknown"]),
  item: z.string().nullable(),
  category: z.enum(["panificados", "verduras", "frutas", "lacteos", "abarrotes", "proteina", "organico"]).nullable(),
  quantity: z.number().nonnegative().nullable(),
  unit: z.string().nullable(),
  quantity_basis: z.enum(["stated", "estimated"]).nullable(),
  condition: z.enum(["edible", "past_prime", "inedible", "unknown"]),
  deadline_hour: z.number().int().min(0).max(23).nullable(),
  location: z.string().nullable(),
  unresolved: z.array(z.string()),
  quote: z.string().min(1)
});
export const ExtractionSchema = z.object({
  events: z.array(EventSchema),
  residual_text: z.string(),
  needs_review: z.boolean(),
  review_reasons: z.array(z.string())
});
export type Extraction = z.infer<typeof ExtractionSchema>;
