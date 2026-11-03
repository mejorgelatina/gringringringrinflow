import { NextResponse } from "next/server";
import { authorizeOrg } from "@/lib/auth/org";
import { liveNetwork } from "@/lib/network/live";
import { inboxFor } from "@/lib/offers/inbox";
import { advanceOffer, missionStore } from "@/lib/offers/missions";
import { offersStore } from "@/lib/offers/store";
import { refreshLiveNetwork } from "@/lib/registry/network";
import { registryStore } from "@/lib/registry/store";

export const runtime = "nodejs";

/** Lots addressed to the caller's organization (it was notified in a wave), newest first. */
export async function GET(request: Request) {
  const auth = await authorizeOrg(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  const reg = await registryStore().findRegistrationByOwner(auth.identity.uid);
  if (!reg) return NextResponse.json({ ok: false, error: "no-registration" }, { status: 404 });
  await refreshLiveNetwork(registryStore());
  const network = liveNetwork();
  const now = Date.now();
  const offers = await offersStore().listOffersNotified(reg.id);
  const advanced: typeof offers = [];
  for (const offer of offers) advanced.push(await advanceOffer(offersStore(), missionStore(), offer, network, now));
  return NextResponse.json({ ok: true, items: inboxFor(advanced, reg.id, network, now) });
}
