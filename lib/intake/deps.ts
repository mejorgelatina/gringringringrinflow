import { extractLocally, extractWithMeta } from "@/lib/meta/meta";
import { shouldCallMeta } from "@/lib/meta/meta-config.mjs";
import { assessPhotoWithMeta } from "@/lib/meta/photo";
import type { IntakeDeps } from "./process";

/** Server-only wiring. Explicit opt-in is required even when a secret is configured, so previews cannot spend credits. */
export function intakeDeps(): IntakeDeps {
  const useMeta = shouldCallMeta({ apiKey: process.env.MODEL_API_KEY, callsEnabled: process.env.META_CALLS_ENABLED });
  const modelId = process.env.META_MODEL_ID || "muse-spark-1.3";
  return { useMeta, modelId, visionModelId: process.env.META_VISION_MODEL_ID || modelId, extractWithMeta, extractLocally, assessPhotoWithMeta };
}
