import { registryStore } from "@/lib/registry/store";
import { refreshLiveNetwork } from "@/lib/registry/network";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAcceptableImageDataUrl } from "@/lib/meta/photo-policy";
import { intakeDeps } from "@/lib/intake/deps";
import { processIntake } from "@/lib/intake/process";
import { PUBLIC_MAX_PER_WINDOW, PUBLIC_WINDOW_MS, clientIp, createRateLimiter } from "@/lib/whatsapp/rate-limit";

const Body = z.object({
  message: z.string().trim().min(1).max(5000),
  // Optional donor photo, re-encoded client-side to a JPEG data URL (drops EXIF). Bytes are checked server-side.
  image: z.string().refine(isAcceptableImageDataUrl, "Unsupported or oversized image").optional(),
  // Demo-only: a labelled fixture result for the photo when Meta calls are off. Ignored when Meta is on.
  photoFixture: z.enum(["clean", "mold", "containers"]).optional()
});
export const runtime = "nodejs";
const overLimit = createRateLimiter(PUBLIC_WINDOW_MS, PUBLIC_MAX_PER_WINDOW);

export async function POST(request: Request) {
  if (overLimit(clientIp(request))) return NextResponse.json({ ok: false, error: "rate_limited", message: "too many requests. try again in a few minutes." }, { status: 429 });
  // Verified registrations join the network every channel evaluates against.
  await refreshLiveNetwork(registryStore());
  const requestId = crypto.randomUUID();
  try {
    const { message, image, photoFixture } = Body.parse(await request.json());
    const result = await processIntake(message, image, intakeDeps(), photoFixture);
    // Images are never stored or logged; the response carries only the structured assessment.
    return NextResponse.json({ ok: true, requestId, ...result, dataMode: "synthetic demo", persistence: "client session only", imageRetention: "not stored" });
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
        : "The message could not be processed. Check model access and share the request ID with the technical team. No retry was attempted."
    }, { status });
  }
}
