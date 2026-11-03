import { NextResponse } from "next/server";
import { z } from "zod";
import { OfferError, declareWeight } from "@/lib/offers/respond";
import { isContext, loadOfferContext } from "@/lib/offers/server";
import { offersStore } from "@/lib/offers/store";
import { PUBLIC_MAX_PER_WINDOW, PUBLIC_WINDOW_MS, clientIp, createRateLimiter } from "@/lib/whatsapp/rate-limit";

export const runtime = "nodejs";
const overLimit = createRateLimiter(PUBLIC_WINDOW_MS, PUBLIC_MAX_PER_WINDOW);
const Body = z.object({ kg: z.number().finite().positive().max(10000) });

/** The donor declares the lot weight so receivers can hold kilos. Frozen once holds exist. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (overLimit(clientIp(request))) return NextResponse.json({ ok: false, error: "rate_limited", message: "too many requests. try again in a few minutes." }, { status: 429 });
  const { id } = await params;
  const ctx = await loadOfferContext(request, id, true);
  if (!isContext(ctx)) return ctx;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request", message: "indica el peso en kilos." }, { status: 400 });
  try {
    const updated = declareWeight(ctx.offer, ctx.identity.uid, parsed.data.kg, Date.now(), ctx.network);
    await offersStore().saveOffer(updated);
    return NextResponse.json({ ok: true, offer: updated });
  } catch (e) {
    if (e instanceof OfferError) return NextResponse.json({ ok: false, error: e.code, message: e.message }, { status: e.status });
    throw e;
  }
}
