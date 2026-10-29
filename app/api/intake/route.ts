import { NextResponse } from "next/server";
import { z } from "zod";
import { extractLocally, extractWithMeta } from "@/lib/meta/meta";
import { evaluateCandidates } from "@/lib/engines/matching.mjs";
import { shouldCallMeta } from "@/lib/meta/meta-config.mjs";
import { assessPhotoWithMeta } from "@/lib/meta/photo";
import { assessPhotoLocally, isAcceptableImageDataUrl, routePhotoAssessment } from "@/lib/meta/photo-policy";

const Body = z.object({
  message: z.string().trim().min(1).max(5000),
  // Optional donor photo, downscaled client-side to a JPEG/PNG/WebP data URL.
  image: z.string().refine(isAcceptableImageDataUrl, "Unsupported or oversized image").optional()
});
export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { message, image } = Body.parse(await request.json());
    // Explicit opt-in is required even when a secret is configured, so previews cannot spend credits.
    const useMeta = shouldCallMeta({
      apiKey: process.env.MODEL_API_KEY,
      callsEnabled: process.env.META_CALLS_ENABLED
    });
    const provider = useMeta ? "Meta Model API" : "Local demo fallback (Meta calls disabled or key missing)";
    const extraction = useMeta ? await extractWithMeta(message) : extractLocally(message);
    const firstSupply = extraction.events.find(e => e.kind === "supply_announced");
    const supply = firstSupply ? {
      category: firstSupply.category,
      quantity: firstSupply.quantity,
      quantityBasis: firstSupply.quantity_basis,
      condition: firstSupply.condition,
      deadlineHour: firstSupply.deadline_hour,
      location: firstSupply.location
    } : null;
    let photo = null;
    if (image) {
      const assessment = useMeta ? await assessPhotoWithMeta(image, message) : assessPhotoLocally();
      const routing = routePhotoAssessment(assessment);
      photo = { provider, model: useMeta ? (process.env.META_VISION_MODEL_ID || process.env.META_MODEL_ID || "muse-spark-1.3") : null, assessment, routing };
      if (routing.suggestedCondition !== "unknown") {
        extraction.needs_review = true;
        extraction.review_reasons.push(`Photo suggests "${routing.suggestedCondition.replaceAll("_", " ")}". A person must confirm condition.`);
        // A photo that contradicts "edible" text makes condition unverified: people-tier routes stay blocked.
        if (supply && supply.condition === "edible") supply.condition = "unknown";
      }
    }
    const candidates = supply ? evaluateCandidates(supply) : [];
    return NextResponse.json({ ok: true, requestId, provider, model: useMeta ? (process.env.META_MODEL_ID || "muse-spark-1.3") : null, extraction, supply, photo, candidates, dataMode: "synthetic demo", persistence: "client session only" });
  } catch (error) {
    const validation = error instanceof z.ZodError;
    const status = validation ? 400 : 502;
    // Keep provider internals and request content out of the public response.
    if (!validation) console.error(`[intake:${requestId}] provider request failed`, error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({
      ok: false,
      requestId,
      error: validation ? "invalid_request" : "intake_failed",
      message: validation
        ? "Submit a message of up to 5,000 characters and, optionally, one JPEG/PNG/WebP photo under 3 MB."
        : "No se pudo procesar el mensaje. Revisa el acceso al modelo y consulta el request ID con el equipo técnico."
    }, { status });
  }
}
