import { NextResponse } from "next/server";
import { z } from "zod";
import { agentWiring } from "@/lib/agent/deps";
import { startRun } from "@/lib/agent/loop";
import { remember } from "@/lib/agent/registry";
import { trackingView } from "@/lib/agent/tracking";
import { seal, stateSigned } from "@/lib/agent/state";
import { isAcceptableImageDataUrl } from "@/lib/meta/photo-policy";

const Body = z.object({
  message: z.string().trim().min(1).max(5000),
  image: z.string().refine(isAcceptableImageDataUrl, "Unsupported or oversized image").optional(),
  // Demo-only: a labelled fixture result for the photo when Meta calls are off. Ignored when Meta is on.
  photoFixture: z.enum(["clean", "mold"]).optional()
});
export const runtime = "nodejs";

/** Start an intake agent run. The image is used for this request only and never stored. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request", message: "Submit a message of up to 5,000 characters and, optionally, one JPEG/PNG/WebP photo under 3 MB." }, { status: 400 });
  const { message, image, photoFixture } = parsed.data;
  const { deps, planner } = agentWiring(photoFixture);
  const run = await startRun(message, image, deps, planner);
  const token = seal(run);
  remember(run.code, token);
  return NextResponse.json({ ok: true, run, token, tracking: trackingView(run), stateSigned: stateSigned() });
}
