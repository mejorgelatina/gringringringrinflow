import { NextResponse } from "next/server";
import { z } from "zod";
import { intakeDeps } from "@/lib/intake/deps";
import { isAcceptableImageDataUrl } from "@/lib/meta/photo-policy";
import { handleInbound, recordTrace } from "@/lib/whatsapp/handler";
import { registryStore } from "@/lib/registry/store";

const Body = z.object({
  text: z.string().trim().max(5000).default(""),
  image: z.string().refine(isAcceptableImageDataUrl, "Unsupported or oversized image").optional(),
  photoFixture: z.enum(["clean", "mold", "containers"]).optional(),
  /** A shared location pin, like whatsapp's 📎 → ubicación. */
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), label: z.string().trim().max(200).default("") }).optional(),
  /** Start a new conversation (forget history and any registration in progress). */
  reset: z.boolean().optional()
});
const SIM_FROM = "5215500000000";
export const runtime = "nodejs";

/** Runs the exact webhook handler on a synthetic message. Never sends a WhatsApp reply. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Send text, a photo, a location, or reset." }, { status: 400 });
  const { text, image, photoFixture, location, reset } = parsed.data;
  const store = registryStore();
  if (reset) {
    await store.saveConversation({ key: `simulator:${SIM_FROM}`, phone: SIM_FROM, source: "simulator", history: [], openQuestion: false, onboarding: null, pin: null, updatedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, reset: true });
  }
  if (!text && !image && !location) return NextResponse.json({ ok: false, message: "Send text, a photo, a location, or reset." }, { status: 400 });
  const id = `sim-${crypto.randomUUID()}`;
  const trace = await handleInbound(
    { id, from: SIM_FROM, timestamp: String(Math.floor(Date.now() / 1000)), type: location ? "location" : image ? "image" : "text", text, mediaId: image ? "simulated" : null, location: location ?? null },
    { deps: intakeDeps(), allowlist: undefined, send: null, fetchMedia: image ? async () => image : null, photoFixture, source: "simulator", store }
  );
  recordTrace(trace);
  return NextResponse.json({ ok: true, trace });
}
