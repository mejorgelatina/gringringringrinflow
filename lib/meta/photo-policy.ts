import { z } from "zod";

/**
 * Photo assessment: what an agent may say about a donor's photo.
 * It describes what is visible. It never certifies that food is safe to eat.
 */
export const VISIBLE_ISSUES = ["mold", "rot_or_decay", "bruising", "discoloration", "crushed_packaging", "leak_or_spill", "pests", "other"] as const;
export const SEVERE_ISSUES: ReadonlySet<string> = new Set(["mold", "rot_or_decay", "pests", "leak_or_spill"]);

export const PhotoAssessmentSchema = z.object({
  visible_items: z.array(z.object({
    item: z.string().min(1),
    category: z.enum(["panificados", "verduras", "frutas", "lacteos", "abarrotes", "proteina", "organico"]).nullable(),
    approx_count: z.number().int().nonnegative().nullable(),
    packaging: z.string().nullable()
  })),
  visible_label_text: z.array(z.string()),
  visible_issues: z.array(z.object({ issue: z.enum(VISIBLE_ISSUES), note: z.string() })),
  visual_grade: z.enum(["no_visible_issues", "minor_visible_issues", "severe_visible_issues", "unclear_photo"]),
  image_quality: z.enum(["good", "poor"]),
  notes: z.string()
});
export type PhotoAssessment = z.infer<typeof PhotoAssessmentSchema>;

export type PhotoRouting = {
  /** Always "unknown" or a downgrade. A photo can never set "edible". */
  suggestedCondition: "unknown" | "past_prime" | "inedible";
  humanConfirmationRequired: true;
  provenance: "model_extracted";
  reasons: string[];
  questionForDonor: string;
};

/**
 * Deterministic policy over a model's photo assessment.
 * Good-looking food still needs a human statement; visible damage can only push toward review or valorization.
 */
export function routePhotoAssessment(a: PhotoAssessment): PhotoRouting {
  const severe = a.visible_issues.filter(i => SEVERE_ISSUES.has(i.issue));
  const reasons: string[] = [];
  let suggestedCondition: PhotoRouting["suggestedCondition"] = "unknown";
  if (a.visual_grade === "unclear_photo" || a.image_quality === "poor") {
    reasons.push("The photo is unclear, so it adds no evidence about condition.");
  }
  if (severe.length > 0 || a.visual_grade === "severe_visible_issues") {
    suggestedCondition = "inedible";
    reasons.push(`Severe visible issues (${severe.map(i => i.issue.replaceAll("_", " ")).join(", ") || "reported by the model"}): suggest compost or valorization unless a person inspects and disagrees.`);
  } else if (a.visible_issues.length > 0 || a.visual_grade === "minor_visible_issues") {
    suggestedCondition = "past_prime";
    reasons.push("Minor visible issues: suggest a person inspects before routing to people.");
  } else if (a.visual_grade === "no_visible_issues") {
    reasons.push("No visible issues, but a photo cannot show temperature, storage history or expiry. The donor must still confirm condition.");
  }
  const questionForDonor = suggestedCondition === "unknown"
    ? "From your photo we can't confirm condition. Is it fit for human consumption, past its prime, or not edible?"
    : "Your photo shows possible damage. Can you confirm whether it's still fit for people, or only for compost?";
  return { suggestedCondition, humanConfirmationRequired: true, provenance: "model_extracted", reasons, questionForDonor };
}

/** Clearly labelled fallback used when Meta calls are disabled: no vision, so no claims. */
export function assessPhotoLocally(): PhotoAssessment {
  return {
    visible_items: [],
    visible_label_text: [],
    visible_issues: [],
    visual_grade: "unclear_photo",
    image_quality: "poor",
    notes: "Local fallback: Meta calls are disabled, so the photo was received but not analyzed."
  };
}

/** Labelled fixtures so the damage-blocking rule can be demonstrated without a model call. Never used when Meta is on. */
export const PHOTO_FIXTURES: Record<"clean" | "mold" | "containers", PhotoAssessment> = {
  clean: {
    visible_items: [{ item: "apples", category: "frutas", approx_count: 12, packaging: "cardboard boxes" }],
    visible_label_text: ["PRODUCE OF MEXICO"],
    visible_issues: [],
    visual_grade: "no_visible_issues",
    image_quality: "good",
    notes: "SIMULATED FIXTURE · no model was called. Boxes look intact; a photo cannot show temperature or storage history."
  },
  mold: {
    visible_items: [{ item: "apples", category: "frutas", approx_count: 12, packaging: "cardboard boxes" }],
    visible_label_text: [],
    visible_issues: [{ issue: "mold", note: "white fuzzy patches on fruit in one box" }, { issue: "crushed_packaging", note: "one box corner crushed" }],
    visual_grade: "severe_visible_issues",
    image_quality: "good",
    notes: "SIMULATED FIXTURE · no model was called. Shows how visible damage is handled."
  },
  containers: {
    visible_items: [{ item: "comida preparada", category: null, approx_count: 12, packaging: "contenedores de plástico con tapa" }],
    visible_label_text: [],
    visible_issues: [],
    visual_grade: "no_visible_issues",
    image_quality: "good",
    notes: "SIMULATED FIXTURE · no model was called. About 12 closed containers; a photo gives a count and a volume, not a weight, a temperature or food safety."
  }
};

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
/** ~3 MB of base64 keeps the request under Vercel's 4.5 MB body limit. */
export const MAX_IMAGE_DATA_URL_LENGTH = 3_000_000;

/** Checks the decoded bytes, not only the declared type, so a renamed file is rejected before any model call. */
export function isAcceptableImageDataUrl(value: string): boolean {
  if (value.length > MAX_IMAGE_DATA_URL_LENGTH) return false;
  const match = DATA_URL.exec(value);
  if (!match) return false;
  const head = Buffer.from(match[2].slice(0, 24), "base64");
  const declared = match[1];
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isPng = head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP";
  return declared === "jpeg" ? isJpeg : declared === "png" ? isPng : isWebp;
}

export type Condition = "edible" | "past_prime" | "inedible" | "unknown";
export type HumanConfirmation = { condition: Exclude<Condition, "unknown">; reviewer: string; at: string; note?: string };
export type ObservedCondition = PhotoRouting["suggestedCondition"] | "not_assessed" | "assessment_failed";

/**
 * Keeps the three sources apart: what the donor said, what a model saw, what a person confirmed.
 * Only a person can make food eligible for people when a photo raised a doubt or could not be read.
 */
export type ConditionEvidence = {
  stated: Condition;
  observed: ObservedCondition;
  humanConfirmed: HumanConfirmation | null;
  effective: Condition;
  peopleRouteBlocked: boolean;
  reason: string;
};

export function resolveCondition(stated: Condition, observed: ObservedCondition, human: HumanConfirmation | null): ConditionEvidence {
  let effective: Condition = stated;
  let reason = "Condition as stated by the donor.";
  if (human) {
    effective = human.condition;
    reason = `Confirmed by ${human.reviewer} after inspection.`;
  } else if (observed === "assessment_failed") {
    effective = stated === "edible" ? "unknown" : stated;
    reason = "Photo could not be assessed, so a stated \"edible\" is not trusted until a person confirms.";
  } else if (observed === "past_prime" || observed === "inedible") {
    effective = stated === "edible" ? "unknown" : stated;
    reason = "The photo shows possible damage, so condition needs a person's inspection.";
  } else if (stated === "unknown") {
    reason = "Nobody has stated the condition yet.";
  }
  return { stated, observed, humanConfirmed: human, effective, peopleRouteBlocked: effective !== "edible", reason };
}
