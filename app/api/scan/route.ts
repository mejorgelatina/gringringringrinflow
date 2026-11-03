import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeOrg } from "@/lib/auth/org";
import { liveNetwork } from "@/lib/network/live";
import { expireMissedPickups, missionStore, scanByToken } from "@/lib/offers/missions";
import { OfferError, statusFor } from "@/lib/offers/respond";
import { NetworkError } from "@/lib/network/coordinator";
import { offersStore } from "@/lib/offers/store";
import { refreshLiveNetwork } from "@/lib/registry/network";
import { registryStore } from "@/lib/registry/store";
import { PUBLIC_MAX_PER_WINDOW, PUBLIC_WINDOW_MS, clientIp, createRateLimiter } from "@/lib/whatsapp/rate-limit";

export const runtime = "nodejs";
const overLimit = createRateLimiter(PUBLIC_WINDOW_MS, PUBLIC_MAX_PER_WINDOW);
const Body = z.object({ token: z.string().trim().min(8).max(64), receivedKg: z.number().finite().positive().max(10000) });

/**
 * The collector scans a mission QR: pickup and verified receipt in one step. Only the holder
 * org scans; a repeated scan returns the same completion. Unknown tokens stay 404.
 */
export async function POST(request: Request) {
  if (overLimit(clientIp(request))) return NextResponse.json({ ok: false, error: "rate_limited", message: "too many requests. try again in a few minutes." }, { status: 429 });
  const auth = await authorizeOrg(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  const reg = await registryStore().findRegistrationByOwner(auth.identity.uid);
  if (!reg) return NextResponse.json({ ok: false, error: "no-registration" }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request", message: "indica el código y los kilos recibidos." }, { status: 400 });
  await refreshLiveNetwork(registryStore());
  const network = liveNetwork();
  const missions = missionStore();
  const found = await missions.getMissionByToken(parsed.data.token);
  if (!found) return NextResponse.json({ ok: false, error: "wrong_code", message: "ese código no abre ninguna misión." }, { status: 404 });
  const offer = await offersStore().getOffer(found.offerId);
  if (!offer) return NextResponse.json({ ok: false, error: "unknown_offer" }, { status: 404 });
  try {
    const now = Date.now();
    const all = await missions.listMissionsByOffer(offer.id);
    // A scan past the window expires the mission and returns the lot to the cascade first.
    const advanced = expireMissedPickups(offer, all, now, network);
    if (advanced.offer !== offer) {
      await offersStore().saveOffer(advanced.offer);
      for (let i = 0; i < all.length; i += 1) {
        if (advanced.missions[i] !== all[i]) await missions.saveMission(advanced.missions[i]);
      }
    }
    const out = scanByToken(advanced.offer, advanced.missions, parsed.data.token, auth.identity.uid, reg.id, parsed.data.receivedKg, now, network);
    if (!out.repeated) {
      await offersStore().saveOffer(out.offer);
      await missions.saveMission(out.mission);
    }
    return NextResponse.json({ ok: true, mission: out.mission, repeated: out.repeated });
  } catch (e) {
    if (e instanceof OfferError) return NextResponse.json({ ok: false, error: e.code, message: e.message }, { status: e.status });
    if (e instanceof NetworkError) {
      const status = statusFor(e.code);
      return NextResponse.json({ ok: false, error: e.code, message: e.message }, { status });
    }
    throw e;
  }
}
