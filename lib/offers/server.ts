import { NextResponse } from "next/server";
import { authorizeOrg, type OrgIdentity } from "@/lib/auth/org";
import { liveNetwork } from "@/lib/network/live";
import type { Network } from "@/lib/network/types";
import { offersStore } from "@/lib/offers/store";
import type { Offer } from "@/lib/offers/types";
import { refreshLiveNetwork } from "@/lib/registry/network";
import { registryStore } from "@/lib/registry/store";
import type { Registration } from "@/lib/registry/types";

// Shared context for the E4 offer routes: verified org, its registration, the offer, and the
// network with verified registrations loaded. Participant id == registration id.

export type OfferContext = { identity: OrgIdentity; reg: Registration; offer: Offer; network: Network };

export async function loadOfferContext(request: Request, id: string, ownerOnly = false): Promise<OfferContext | NextResponse> {
  const auth = await authorizeOrg(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  const reg = await registryStore().findRegistrationByOwner(auth.identity.uid);
  if (!reg) return NextResponse.json({ ok: false, error: "no-registration" }, { status: 404 });
  const offer = await offersStore().getOffer(id);
  if (!offer) return NextResponse.json({ ok: false, error: "unknown_offer" }, { status: 404 });
  if (ownerOnly && offer.donorUid !== auth.identity.uid) {
    return NextResponse.json({ ok: false, error: "not-owner", message: "solo el donante ve esta oferta completa." }, { status: 403 });
  }
  // Verified registrations join the network every mutation evaluates against.
  await refreshLiveNetwork(registryStore());
  return { identity: auth.identity, reg, offer, network: liveNetwork() };
}

export function isContext(v: OfferContext | NextResponse): v is OfferContext {
  return !(v instanceof NextResponse);
}
