import { evaluateCandidates } from "../engines/matching.mjs";
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
  category: string | null;
  quantity: number | null;
  quantityBasis: "stated" | "estimated" | "confirmed" | null;
  condition: Condition;
  deadlineHour: number | null;
  location: string | null;
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
  candidates: ReturnType<typeof evaluateCandidates>;
  metaCalls: number;
};

export const LOCAL_PROVIDER = "Local demo fallback (Meta calls disabled or key missing)";

export async function processIntake(message: string, image: string | undefined, deps: IntakeDeps, fixture?: keyof typeof PHOTO_FIXTURES): Promise<IntakeResult> {
  const provider = deps.useMeta ? "Meta Model API" : LOCAL_PROVIDER;
  let metaCalls = 0;
  if (deps.useMeta) metaCalls++;
  const extraction = deps.useMeta ? await deps.extractWithMeta(message) : deps.extractLocally(message);
  const first = extraction.events.find(e => e.kind === "supply_announced");
  const supply: Supply | null = first ? {
    category: first.category,
    quantity: first.quantity,
    quantityBasis: first.quantity_basis,
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

  const condition = supply ? resolveCondition(supply.condition, observed, null) : null;
  if (supply && condition) supply.condition = condition.effective;
  const candidates = supply ? evaluateCandidates(supply) : [];
  return { provider, model: deps.useMeta ? deps.modelId : null, extraction, supply, demand, photo, condition, candidates, metaCalls };
}

/** Operator review after inspection. Never calls a model; keeps the model's observation alongside the decision. */
export function confirmIntake(supply: Supply, stated: Condition, observed: ObservedCondition, human: HumanConfirmation, quantity?: number) {
  const condition = resolveCondition(stated, observed, human);
  const reviewed: Supply = {
    ...supply,
    condition: condition.effective,
    ...(quantity !== undefined ? { quantity, quantityBasis: "confirmed" as const } : {})
  };
  return { supply: reviewed, condition, candidates: evaluateCandidates(reviewed) };
}
