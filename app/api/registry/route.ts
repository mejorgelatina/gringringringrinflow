import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { registryStore } from "@/lib/registry/store";
import { refreshLiveNetwork } from "@/lib/registry/network";
import type { InboxItem, Registration } from "@/lib/registry/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The team view of registrations and incoming offers. Contact data is personal data: it is served only with
// the operator key (env OPERATOR_KEY). Without the key, only simulator records (synthetic) are visible.

function authorized(request: Request): boolean {
  const key = process.env.OPERATOR_KEY;
  const given = request.headers.get("x-operator-key") ?? "";
  if (!key || !given) return false;
  const a = Buffer.from(key), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

const visible = (ok: boolean) => (r: { source: Registration["source"] }) => ok || r.source === "simulator";

export async function GET(request: Request) {
  const ok = authorized(request);
  const store = registryStore();
  const [registrations, inbox] = await Promise.all([store.listRegistrations(), store.listInbox(100)]);
  return NextResponse.json({
    ok: true,
    authorized: ok,
    operatorKeySet: Boolean(process.env.OPERATOR_KEY),
    store: store.kind,
    registrations: registrations.filter(visible(ok)),
    inbox: inbox.filter(visible(ok)) as InboxItem[],
  }, { headers: { "Cache-Control": "no-store" } });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify"), id: z.string().max(80), by: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("reject"), id: z.string().max(80), by: z.string().trim().min(1).max(80), notes: z.string().trim().max(500).default("") }),
  z.object({ action: z.literal("place"), id: z.string().max(80), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), area: z.string().trim().max(80).optional() }),
]);

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "invalid request" }, { status: 400 });
  const ok = authorized(request);
  const store = registryStore();
  const reg = await store.getRegistration(parsed.data.id);
  if (!reg || !visible(ok)(reg)) return NextResponse.json({ ok: false, message: ok ? "registration not found" : "operator key required" }, { status: ok ? 404 : 401 });
  const now = new Date().toISOString();
  const b = parsed.data;
  let next: Registration;
  if (b.action === "verify") {
    if (!reg.location) return NextResponse.json({ ok: false, message: "place it on the map first: it has no coordinates" }, { status: 409 });
    next = { ...reg, status: "verified", verifiedAt: now, verifiedBy: b.by, updatedAt: now };
  } else if (b.action === "reject") {
    next = { ...reg, status: "rejected", verifiedAt: null, verifiedBy: b.by, notes: b.notes || reg.notes, updatedAt: now };
  } else {
    next = { ...reg, location: { lat: b.lat, lng: b.lng }, locationSource: reg.locationSource ?? "colonia", area: b.area ?? reg.area, updatedAt: now };
  }
  await store.saveRegistration(next);
  const participants = await refreshLiveNetwork(store);
  return NextResponse.json({ ok: true, registration: next, networkParticipants: participants.length });
}
