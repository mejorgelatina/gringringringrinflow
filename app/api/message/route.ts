import { NextResponse } from "next/server";
import { z } from "zod";
import { intakeDeps } from "@/lib/intake/deps";
import { isAcceptableImageDataUrl } from "@/lib/meta/photo-policy";
import { handleInbound, recordTrace } from "@/lib/whatsapp/handler";
import { registryStore } from "@/lib/registry/store";

const Body = z.object({
  text: z.string().trim().max(5000).default(""),
  image: z.string().refine(isAcceptableImageDataUrl, "Unsupported or oversized image").optional(),
  /** Earlier messages in this web conversation, so an answer like "30 cajas" completes the offer instead of starting over. */
  history: z.array(z.string().trim().max(2000)).max(10).default([]),
  /** A random id the page keeps per browser tab. With it the server remembers the conversation (and can run onboarding). */
  session: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/).optional()
});
export const runtime = "nodejs";

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();
/** Public page, so a per-instance cap keeps one visitor from spending model credits in a loop. */
function overLimit(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > MAX_PER_WINDOW;
}

/** The web chat: same handler as the WhatsApp webhook, so a message here and on WhatsApp gets the same answer. */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (overLimit(ip)) return NextResponse.json({ ok: false, message: "too many messages. try again in a few minutes." }, { status: 429 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (!parsed.data.text && !parsed.data.image)) return NextResponse.json({ ok: false, message: "send text, a photo, or both." }, { status: 400 });
  const { image, history, session } = parsed.data;
  // With a session the server keeps the conversation; the old client-side history is only a fallback.
  const text = session ? parsed.data.text : [...history, parsed.data.text].filter(Boolean).join("\n");
  if (text.length > 8000) return NextResponse.json({ ok: false, message: "this conversation is too long. start over with a new message." }, { status: 400 });
  const trace = await handleInbound(
    { id: `web-${crypto.randomUUID()}`, from: "web", timestamp: String(Math.floor(Date.now() / 1000)), type: image ? "image" : "text", text, mediaId: image ? "web" : null },
    { deps: intakeDeps(), allowlist: undefined, send: null, fetchMedia: image ? async () => image : null, source: "web", ...(session ? { store: registryStore(), conversationKey: `web:${session}` } : {}) }
  );
  recordTrace(trace);
  return NextResponse.json({ ok: true, reply: trace.reply, kind: trace.onboarding ? "registration" : trace.intake?.supply ? "offer" : trace.intake?.demand ? "receive" : "none" });
}
