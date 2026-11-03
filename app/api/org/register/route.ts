import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeOrg } from "@/lib/auth/org";
import { InvalidProfileError, buildWebRegistration } from "@/lib/registry/profile";
import { registryStore } from "@/lib/registry/store";
import { PUBLIC_MAX_PER_WINDOW, PUBLIC_WINDOW_MS, clientIp, createRateLimiter } from "@/lib/whatsapp/rate-limit";

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  roles: z.array(z.enum(["donor", "receiver", "maker", "compost"])).min(1).max(4),
  address: z.string().trim().max(200).nullable().optional(),
  hoursText: z.string().trim().max(200).nullable().optional(),
  contactName: z.string().trim().max(80).nullable().optional(),
  contactPhone: z.string().max(30).nullable().optional(),
  acceptsText: z.string().trim().max(500).nullable().optional(),
  generatesText: z.string().trim().max(500).nullable().optional(),
  selfPickup: z.boolean().nullable().optional(),
});
export const runtime = "nodejs";
const overLimit = createRateLimiter(PUBLIC_WINDOW_MS, PUBLIC_MAX_PER_WINDOW);

/** Creates the organization's pending registration, owned by the caller's Firebase uid. */
export async function POST(request: Request) {
  if (overLimit(clientIp(request))) return NextResponse.json({ ok: false, error: "rate_limited", message: "too many requests. try again in a few minutes." }, { status: 429 });
  const auth = await authorizeOrg(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request", message: "revisa los datos de la organización." }, { status: 400 });
  const store = registryStore();
  const existing = await store.findRegistrationByOwner(auth.identity.uid);
  if (existing) return NextResponse.json({ ok: false, error: "already-registered", id: existing.id, status: existing.status }, { status: 409 });
  let reg;
  try {
    reg = buildWebRegistration({ ...parsed.data }, { id: `reg-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`, ownerUid: auth.identity.uid, now: new Date().toISOString() });
  } catch (e) {
    if (e instanceof InvalidProfileError) return NextResponse.json({ ok: false, error: "invalid_request", message: "revisa los datos de la organización." }, { status: 400 });
    throw e;
  }
  await store.saveRegistration(reg);
  return NextResponse.json({ ok: true, id: reg.id, status: reg.status });
}
