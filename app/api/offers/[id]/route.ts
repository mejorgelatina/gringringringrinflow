import { NextResponse } from "next/server";
import { isContext, loadOfferContext } from "@/lib/offers/server";

export const runtime = "nodejs";

/** One offer, whole, for its donor only. Receivers read redacted offers through /api/inbox. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadOfferContext(request, id, true);
  if (!isContext(ctx)) return ctx;
  return NextResponse.json({ ok: true, offer: ctx.offer });
}
