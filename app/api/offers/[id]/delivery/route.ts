import { NextResponse } from "next/server";
import { z } from "zod";
import { inboxFor } from "@/lib/offers/inbox";
import { ensureMission, missionStore } from "@/lib/offers/missions";
import { OfferError, chooseDeliveryMode } from "@/lib/offers/respond";
import { isContext, loadOfferContext } from "@/lib/offers/server";
import { offersStore } from "@/lib/offers/store";
import { PUBLIC_MAX_PER_WINDOW, PUBLIC_WINDOW_MS, clientIp, createRateLimiter } from "@/lib/whatsapp/rate-limit";

export const runtime = "nodejs";
const overLimit = createRateLimiter(PUBLIC_WINDOW_MS, PUBLIC_MAX_PER_WINDOW);
const Body = z.object({
  reservationId: z.string().min(1).max(120),
  mode: z.enum(["pickup", "own_courier", "courier", "backhaul"]),
  vehicleId: z.string().min(1).max(120).nullable().optional(),
});

/** The holder picks how to receive: pickup is free, delivery cost is on them. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (overLimit(clientIp(request))) return NextResponse.json({ ok: false, error: "rate_limited", message: "too many requests. try again in a few minutes." }, { status: 429 });
  const { id } = await params;
  const ctx = await loadOfferContext(request, id);
  if (!isContext(ctx)) return ctx;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request", message: "elige una forma de entrega válida." }, { status: 400 });
  try {
    const updated = chooseDeliveryMode(ctx.offer, ctx.reg.id, parsed.data.reservationId, parsed.data.mode, parsed.data.vehicleId ?? null, Date.now(), ctx.network);
    await offersStore().saveOffer(updated);
    // Scheduling a hold opens its mission (idempotent; couriers stall before this).
    const scheduled = updated.case?.reservations.find((r) => r.id === parsed.data.reservationId);
    if (scheduled) await ensureMission(missionStore(), updated, scheduled, ctx.identity.uid);
    return NextResponse.json({ ok: true, item: inboxFor([updated], ctx.reg.id, ctx.network, Date.now())[0] });
  } catch (e) {
    if (e instanceof OfferError) return NextResponse.json({ ok: false, error: e.code, message: e.message }, { status: e.status });
    throw e;
  }
}
