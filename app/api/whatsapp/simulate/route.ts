import { NextResponse } from "next/server";
import { z } from "zod";
import { intakeDeps } from "@/lib/intake/deps";
import { isAcceptableImageDataUrl } from "@/lib/meta/photo-policy";
import { handleInbound, recordTrace } from "@/lib/whatsapp/handler";

const Body = z.object({
  text: z.string().trim().max(5000).default(""),
  image: z.string().refine(isAcceptableImageDataUrl, "Unsupported or oversized image").optional(),
  photoFixture: z.enum(["clean", "mold"]).optional()
});
export const runtime = "nodejs";

/** Runs the exact webhook handler on a synthetic message. Never sends a WhatsApp reply. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (!parsed.data.text && !parsed.data.image)) return NextResponse.json({ ok: false, message: "Send text, a photo, or both." }, { status: 400 });
  const { text, image, photoFixture } = parsed.data;
  const id = `sim-${crypto.randomUUID()}`;
  const trace = await handleInbound(
    { id, from: "5215500000000", timestamp: String(Math.floor(Date.now() / 1000)), type: image ? "image" : "text", text, mediaId: image ? "simulated" : null },
    { deps: intakeDeps(), allowlist: undefined, send: null, fetchMedia: image ? async () => image : null, photoFixture, source: "simulator" }
  );
  recordTrace(trace);
  return NextResponse.json({ ok: true, trace });
}
