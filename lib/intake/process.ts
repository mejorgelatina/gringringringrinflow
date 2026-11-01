import { evaluateSupply } from "../network/supply.ts";
import { characterize, countFromPhoto } from "../icc/characterize.ts";
import type { Channel, IccRecord } from "../icc/types.ts";
import type { Point } from "../network/types.ts";
import type { Extraction } from "../meta/types";
import { assessPhotoLocally, PHOTO_FIXTURES, resolveCondition, routePhotoAssessment, type Condition, type ConditionEvidence, type HumanConfirmation, type ObservedCondition, type PhotoAssessment, type PhotoRouting } from "../meta/photo-policy.ts";

/** The model-backed and local steps, injected so the same pipeline serves the web form, WhatsApp and tests. */
export type IntakeDeps = {
  useMeta: boolean;
  modelId: string | null;
  visionModelId: string | null;
  extractWithMeta: (message: string) => Promise<Extraction>;
  extractLocally: (message: string) => Extraction;
  assessPhotoWithMeta: (image: string, caption: string) => Promise<PhotoAssessment>;
};

export type Supply = {
  /** What the donor called it ("huevo", "pan"); a maker matches on this, not on category. */
  item?: string | null;
  category: string | null;
  quantity: number | null;
  /** caja, pieza, kg… A count is not a weight: ICC turns it into kilos only with a reference, and labels it. */
  unit?: string | null;
  quantityBasis: "stated" | "estimated" | "confirmed" | null;
  /** Where an estimated count came from. A count read off a photo is never "stated". */
  quantitySource?: "texto" | "foto" | "operador" | null;
  condition: Condition;
  deadlineHour: number | null;
  location: string | null;
  /** Exact pickup point from a whatsapp pin or the donor's registered address. */
  point?: Point | null;
  /** The registered donor offering it, if any. */
  donorId?: string | null;
  /** A weight someone measured (scale) or checked on site. */
  measuredKg?: { kg: number; provenance: "medido" | "verificado"; by: string; at: string } | null;
};

/** An organization saying it can receive food. It becomes a recipient only after a person verifies it. */
export type Demand = {
  category: string | null;
  quantity: number | null;
  unit: string | null;
  untilHour: number | null;
  location: string | null;
};

export type PhotoResult =
  | { status: "assessed"; provider: string; model: string | null; assessment: PhotoAssessment; routing: PhotoRouting }
  | { status: "failed"; provider: string; model: string | null; error: string };

export type IntakeResult = {
  provider: string;
  model: string | null;
  extraction: Extraction;
  supply: Supply | null;
  demand: Demand | null;
  photo: PhotoResult | null;
  condition: ConditionEvidence | null;
  /** The lot's ICC characterization: product, quality, risk, physical, each value with its provenance. */
  icc: IccRecord | null;
  candidates: ReturnType<typeof evaluateSupply>;
  metaCalls: number;
};

export const LOCAL_PROVIDER = "Local demo fallback (Meta calls disabled or key missing)";

/**
 * The shared ingestion path. WhatsApp, /send and /intake call it; the agent's tools call the same
 * steps one at a time. Extraction and photo assessment produce evidence; ICC (`characterize`) turns it
 * into one record; the network engine evaluates that record.
 */
/**
 * What grinflow already knows about where the lot is and who offers it: a location pin from this
 * conversation, or the address of a registered donor. Used only when the message itself names no place
 * (a pin always wins: it is the most exact thing the donor gave).
 */
export type IntakeOrigin = { point: Point; label: string; source: "pin" | "registro"; donorId?: string | null } | { point?: null; label?: null; source?: null; donorId?: string | null };

export async function processIntake(message: string, image: string | undefined, deps: IntakeDeps, fixture?: keyof typeof PHOTO_FIXTURES, channel: Channel = "intake", origin?: IntakeOrigin): Promise<IntakeResult> {
  const receivedAt = new Date().toISOString();
  const provider = deps.useMeta ? "Meta Model API" : LOCAL_PROVIDER;
  let metaCalls = 0;
  if (deps.useMeta) metaCalls++;
  const extraction = deps.useMeta ? await deps.extractWithMeta(message) : deps.extractLocally(message);
  const first = extraction.events.find(e => e.kind === "supply_announced");
  let supply: Supply | null = first ? {
    item: first.item,
    category: first.category,
    quantity: first.quantity,
    unit: first.unit,
    quantityBasis: first.quantity_basis,
    quantitySource: first.quantity == null ? null : "texto",
    condition: first.condition,
    deadlineHour: first.deadline_hour,
    location: first.location
  } : null;
  const wanted = supply ? undefined : extraction.events.find(e => e.kind === "demand_declared");
  const demand: Demand | null = wanted ? { category: wanted.category, quantity: wanted.quantity, unit: wanted.unit, untilHour: wanted.deadline_hour, location: wanted.location } : null;

  let photo: PhotoResult | null = null;
  let observed: ObservedCondition = "not_assessed";
  if (image) {
    if (deps.useMeta) {
      metaCalls++;
      try {
        const assessment = await deps.assessPhotoWithMeta(image, message);
        photo = { status: "assessed", provider, model: deps.visionModelId, assessment, routing: routePhotoAssessment(assessment) };
      } catch (error) {
        // Timeouts, 429/5xx and schema-invalid output all fail closed; no retry, so no repeated spend.
        photo = { status: "failed", provider, model: deps.visionModelId, error: error instanceof Error ? error.name : "UnknownError" };
      }
    } else {
      const assessment = fixture ? PHOTO_FIXTURES[fixture] : assessPhotoLocally();
      photo = { status: "assessed", provider: fixture ? "Simulated photo fixture (no model call)" : provider, model: null, assessment, routing: routePhotoAssessment(assessment) };
    }
    observed = photo.status === "failed" ? "assessment_failed" : photo.routing.suggestedCondition;
    if (photo.status === "failed") {
      extraction.needs_review = true;
      extraction.review_reasons.push("The photo could not be assessed. Ask for another photo or inspect in person.");
    } else if (observed !== "unknown") {
      extraction.needs_review = true;
      extraction.review_reasons.push(`Photo suggests "${observed.replaceAll("_", " ")}". A person must confirm condition.`);
    }
  }

  if (supply && origin) {
    if (origin.donorId) supply.donorId = origin.donorId;
    if (origin.point && (origin.source === "pin" || !supply.location)) { supply.point = origin.point; supply.location = origin.label; }
  }
  const condition = supply ? resolveCondition(supply.condition, observed, null) : null;
  if (supply && condition) supply.condition = condition.effective;
  if (supply) supply = countFromPhoto(supply, iccPhoto(photo));
  const icc = supply ? characterize({ channel, text: message, supply, photo: iccPhoto(photo), condition, receivedAt }) : null;
  const candidates = supply ? evaluateSupply(supply, message) : [];
  return { provider, model: deps.useMeta ? deps.modelId : null, extraction, supply, demand, photo, condition, icc, candidates, metaCalls };
}

/** What ICC may read from a photo result: the assessment and the model that made it, never the image. */
export function iccPhoto(photo: PhotoResult | null) {
  if (!photo) return null;
  return photo.status === "failed" ? { status: "failed" as const, model: photo.model } : { status: "assessed" as const, model: photo.model, assessment: photo.assessment };
}

/** Operator review after inspection. Never calls a model; keeps the model's observation alongside the decision. */
export function confirmIntake(supply: Supply, stated: Condition, observed: ObservedCondition, human: HumanConfirmation, quantity?: number, text = "", weightKg?: number) {
  const condition = resolveCondition(stated, observed, human);
  const reviewed: Supply = {
    ...supply,
    condition: condition.effective,
    ...(quantity !== undefined ? { quantity, quantityBasis: "confirmed" as const, quantitySource: "operador" as const } : {}),
    ...(weightKg !== undefined && weightKg > 0 ? { measuredKg: { kg: weightKg, provenance: "verificado" as const, by: human.reviewer, at: human.at } } : {})
  };
  const icc = characterize({ channel: "intake", text, supply: reviewed, condition });
  return { supply: reviewed, condition, icc, candidates: evaluateSupply(reviewed, text) };
}
