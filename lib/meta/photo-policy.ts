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

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
/** ~3 MB of base64 keeps the request under Vercel's 4.5 MB body limit. */
export const MAX_IMAGE_DATA_URL_LENGTH = 3_000_000;
export function isAcceptableImageDataUrl(value: string): boolean {
  return value.length <= MAX_IMAGE_DATA_URL_LENGTH && DATA_URL.test(value);
}
