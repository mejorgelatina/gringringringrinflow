import { NextResponse } from "next/server";
import { authorizeOrg } from "@/lib/auth/org";
import { CO2_FACTOR, WATER_FACTOR } from "@/lib/impact/factors";
import { computeImpact, givenFromOffer, receivedFromMission, type Delivery } from "@/lib/impact/compute";
import { missionStore } from "@/lib/offers/missions";
import { offersStore } from "@/lib/offers/store";

export const runtime = "nodejs";

/**
 * The caller's own impact, from verified receipt only. Donors see what their lots delivered;
 * holders see what their missions received. No network-wide numbers (team-only by decision).
 */
export async function GET(request: Request) {
  const auth = await authorizeOrg(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  const given: Delivery[] = [];
  for (const offer of await offersStore().listOffersByOwner(auth.identity.uid)) {
    given.push(...givenFromOffer(offer));
  }
  const received: Delivery[] = [];
  const offers = offersStore();
  for (const mission of await missionStore().listMissionsByHolder(auth.identity.uid)) {
    received.push(...receivedFromMission(mission, await offers.getOffer(mission.offerId)));
  }
  return NextResponse.json({
    ok: true,
    impact: computeImpact(given, received),
    factors: { co2: CO2_FACTOR, water: WATER_FACTOR },
  });
}
