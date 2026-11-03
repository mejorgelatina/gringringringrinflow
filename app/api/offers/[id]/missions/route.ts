import { NextResponse } from "next/server";
import { advanceOffer, missionStore } from "@/lib/offers/missions";
import { isContext, loadOfferContext } from "@/lib/offers/server";
import { offersStore } from "@/lib/offers/store";

export const runtime = "nodejs";

/** Missions on one offer, with QR tokens, for its donor only. The donor displays the QR. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadOfferContext(request, id, true);
  if (!isContext(ctx)) return ctx;
  const advanced = await advanceOffer(offersStore(), missionStore(), ctx.offer, ctx.network, Date.now());
  const missions = await missionStore().listMissionsByOffer(advanced.id);
  return NextResponse.json({ ok: true, missions });
}
