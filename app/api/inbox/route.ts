import { NextResponse } from "next/server";
import { authorizeOrg } from "@/lib/auth/org";
import { liveNetwork } from "@/lib/network/live";
import { inboxFor } from "@/lib/offers/inbox";
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
  const offers = await offersStore().listOffersNotified(reg.id);
  return NextResponse.json({ ok: true, items: inboxFor(offers, reg.id, network, Date.now()) });
}
