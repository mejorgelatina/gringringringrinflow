import { NextResponse } from "next/server";
import { z } from "zod";
import { agentWiring } from "@/lib/agent/deps";
import { authorizeOrg } from "@/lib/auth/org";
import { intakeDeps } from "@/lib/intake/deps";
import { isAcceptableImageDataUrl } from "@/lib/meta/photo-policy";
import { publishOffer } from "@/lib/offers/publish";
import { offersStore } from "@/lib/offers/store";
import { refreshLiveNetwork } from "@/lib/registry/network";
import { registryStore } from "@/lib/registry/store";
import { PUBLIC_MAX_PER_WINDOW, PUBLIC_WINDOW_MS, clientIp, createRateLimiter } from "@/lib/whatsapp/rate-limit";

export const runtime = "nodejs";
const overLimit = createRateLimiter(PUBLIC_WINDOW_MS, PUBLIC_MAX_PER_WINDOW);

const Body = z.object({
  message: z.string().trim().min(1).max(2000),
  photos: z.array(z.string().max(3_000_000)).max(3).optional().default([]),
  confirmEdible: z.boolean().optional().default(false),
});

/** The caller's own offers, newest first. Only the owner uid from the verified token reads them. */
export async function GET(request: Request) {
  const auth = await authorizeOrg(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  const offers = await offersStore().listOffersByOwner(auth.identity.uid);
  return NextResponse.json({ ok: true, offers });
}

/**
 * Publishes an offer: the donor's message plus up to three photos goes through extraction,
 * ICC and eligibility, the agent drafts a proposal, and the evidence is persisted under the
 * caller's uid. Photos are analyzed, never stored. Only donor organizations publish.
 */
export async function POST(request: Request) {
  if (overLimit(clientIp(request))) return NextResponse.json({ ok: false, error: "rate_limited", message: "too many requests. try again in a few minutes." }, { status: 429 });
  const auth = await authorizeOrg(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request", message: "revisa el texto y las fotos de la oferta." }, { status: 400 });
  const reg = await registryStore().findRegistrationByOwner(auth.identity.uid);
  if (!reg) return NextResponse.json({ ok: false, error: "no-registration", message: "registra tu organización antes de publicar." }, { status: 404 });
  if (!reg.roles.includes("donor")) return NextResponse.json({ ok: false, error: "not-a-donor", message: "solo las organizaciones donantes publican ofertas." }, { status: 403 });
  const photos = parsed.data.photos ?? [];
  const bad = photos.findIndex((p) => !isAcceptableImageDataUrl(p));
  if (bad >= 0) return NextResponse.json({ ok: false, error: "invalid_photo", message: `la foto ${bad + 1} no es una imagen válida (jpeg/png/webp/gif, máx 3mb).` }, { status: 400 });
  // Verified registrations join the network the offer is matched against.
  await refreshLiveNetwork(registryStore());
  const { deps, planner } = agentWiring();
  const offer = await publishOffer(
    {
      message: parsed.data.message,
      photos,
      donorUid: auth.identity.uid,
      donorRegId: reg.id,
      donorName: reg.name,
      donorRegStatus: reg.status,
      confirmEdible: parsed.data.confirmEdible,
      donorAddress: reg.address ?? null,
    },
    { intake: intakeDeps(), agent: deps, planner },
  );
  await offersStore().saveOffer(offer);
  return NextResponse.json({ ok: true, offer }, { status: 201 });
}
