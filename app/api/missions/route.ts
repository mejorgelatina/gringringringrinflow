import { NextResponse } from "next/server";
import { authorizeOrg } from "@/lib/auth/org";
import { liveNetwork } from "@/lib/network/live";
import { inboxFor } from "@/lib/offers/inbox";
import { advanceOffer, missionStore, type MissionItem } from "@/lib/offers/missions";
import { offersStore } from "@/lib/offers/store";
import { refreshLiveNetwork } from "@/lib/registry/network";
import { registryStore } from "@/lib/registry/store";

export const runtime = "nodejs";

/** The caller's missions: accepted pickups with their QR token, window and receipt. */
export async function GET(request: Request) {
  const auth = await authorizeOrg(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  const reg = await registryStore().findRegistrationByOwner(auth.identity.uid);
  if (!reg) return NextResponse.json({ ok: false, error: "no-registration" }, { status: 404 });
  await refreshLiveNetwork(registryStore());
  const network = liveNetwork();
  const now = Date.now();
  const list = await missionStore().listMissionsByHolder(auth.identity.uid);
  const items: MissionItem[] = [];
  for (const mission of list) {
    const offer = await offersStore().getOffer(mission.offerId);
    if (!offer) continue;
    const advanced = await advanceOffer(offersStore(), missionStore(), offer, network, now);
    const fresh = mission.status === "active"
      ? (await missionStore().getMission(mission.id)) ?? mission
      : mission;
    const [item] = inboxFor([advanced], reg.id, network, now);
    items.push({ mission: fresh, item: item ?? null });
  }
  return NextResponse.json({ ok: true, missions: items });
}
