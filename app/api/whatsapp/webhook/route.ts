import { NextResponse } from "next/server";
import { liveContext } from "@/lib/whatsapp/context";
import { alreadyHandled, handleInbound, recordTrace } from "@/lib/whatsapp/handler";
import { parseInbound, verifySignature, verifySubscription } from "@/lib/whatsapp/webhook";
import { claimWebhookMessage, persistWhatsAppTurn } from "@/lib/firebase/whatsapp-store";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Subscription handshake from the Meta App dashboard. */
export async function GET(request: Request) {
  const challenge = verifySubscription(new URL(request.url).searchParams, process.env.WHATSAPP_VERIFY_TOKEN);
  return challenge ? new Response(challenge, { status: 200 }) : new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  // Unsigned or wrongly signed requests never reach the model.
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ ok: true, handled: 0 }); }
  const ctx = liveContext();
  let handled = 0;
  for (const msg of parseInbound(payload)) {
    if (alreadyHandled(msg.id)) continue;
    const claim = await claimWebhookMessage(msg.id);
    if (claim === "duplicate") continue;
    const trace = await handleInbound(msg, ctx);
    recordTrace(trace);
    // One line per turn for Vercel's Logs tab: outcome and failure steps only, never message text or numbers.
    console.log("whatsapp turn", JSON.stringify({ replyStatus: trace.replyStatus, steps: trace.steps.map((s) => ["ignored", "reply", "memory", "photo", "inbox"].includes(s.step) ? `${s.step}: ${s.detail}` : s.step) }));
    try { await persistWhatsAppTurn(msg, trace); }
    catch (error) { console.error("Firebase WhatsApp persistence failed", error); }
    handled++;
  }
  // Always 200 once verified: a non-200 makes Meta redeliver, which would repeat model calls.
  return NextResponse.json({ ok: true, handled });
}
