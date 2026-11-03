import { NextResponse } from "next/server";
import { z } from "zod";
import { inboxFor } from "@/lib/offers/inbox";
import { OfferError, answerQuote } from "@/lib/offers/respond";
import { isContext, loadOfferContext } from "@/lib/offers/server";
import { offersStore } from "@/lib/offers/store";
import { PUBLIC_MAX_PER_WINDOW, PUBLIC_WINDOW_MS, clientIp, createRateLimiter } from "@/lib/whatsapp/rate-limit";

export const runtime = "nodejs";
const overLimit = createRateLimiter(PUBLIC_WINDOW_MS, PUBLIC_MAX_PER_WINDOW);
const Body = z.object({ reservationId: z.string().min(1).max(120), action: z.enum(["accept", "decline"]) });

/** The holder accepts or declines a courier quote. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (overLimit(clientIp(request))) return NextResponse.json({ ok: false, error: "rate_limited", message: "too many requests. try again in a few minutes." }, { status: 429 });
  const { id } = await params;
  const ctx = await loadOfferContext(request, id);
  if (!isContext(ctx)) return ctx;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request", message: "indica si aceptas o rechazas la cotización." }, { status: 400 });
  try {
    const updated = answerQuote(ctx.offer, ctx.reg.id, parsed.data.reservationId, parsed.data.action === "accept", Date.now(), ctx.network);
    await offersStore().saveOffer(updated);
    return NextResponse.json({ ok: true, item: inboxFor([updated], ctx.reg.id, ctx.network, Date.now())[0] });
  } catch (e) {
    if (e instanceof OfferError) return NextResponse.json({ ok: false, error: e.code, message: e.message }, { status: e.status });
    throw e;
  }
}
