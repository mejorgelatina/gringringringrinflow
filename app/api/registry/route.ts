import { NextResponse } from "next/server";
import { z } from "zod";
import { registryStore } from "@/lib/registry/store";
import { refreshLiveNetwork } from "@/lib/registry/network";
import type { InboxItem, Registration } from "@/lib/registry/types";
import { checkTeam } from "@/lib/auth/team";
import { firebaseWebConfig } from "@/lib/firebase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The team view of registrations and incoming offers. Contact data is personal data: it is served only to a
// team member signed in with Firebase Auth (lib/auth/team.ts) or with the operator key (env OPERATOR_KEY).
// Without either, only simulator records (synthetic) are visible.

const visible = (ok: boolean) => (r: { source: Registration["source"] }) => ok || r.source === "simulator";

export async function GET(request: Request) {
  const team = await checkTeam(request);
  const ok = team.ok;
  const store = registryStore();
  const [registrations, inbox] = await Promise.all([store.listRegistrations(), store.listInbox(100)]);
  return NextResponse.json({
    ok: true,
    authorized: ok,
    operatorKeySet: Boolean(process.env.OPERATOR_KEY),
    firebaseAuth: Boolean(firebaseWebConfig()),
    teamEmailsSet: Boolean(process.env.GRINFLOW_TEAM_EMAILS?.trim()),
    signedInAs: team.ok && team.identity.via === "firebase" ? team.identity.email : null,
    denied: team.ok ? null : team.reason,
    store: store.kind,
    registrations: registrations.filter(visible(ok)),
    inbox: inbox.filter(visible(ok)) as InboxItem[],
  }, { headers: { "Cache-Control": "no-store" } });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify"), id: z.string().max(80), by: z.string().trim().max(80).default("") }),
  z.object({ action: z.literal("reject"), id: z.string().max(80), by: z.string().trim().max(80).default(""), notes: z.string().trim().max(500).default("") }),
  z.object({ action: z.literal("place"), id: z.string().max(80), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), area: z.string().trim().max(80).optional() }),
]);

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "invalid request" }, { status: 400 });
  const team = await checkTeam(request);
  const ok = team.ok;
  const store = registryStore();
  const reg = await store.getRegistration(parsed.data.id);
  if (!reg || !visible(ok)(reg)) return NextResponse.json({ ok: false, message: ok ? "registration not found" : "operator key required" }, { status: ok ? 404 : 401 });
  const now = new Date().toISOString();
  const b = parsed.data;
  // A signed-in team member signs with their verified email; the typed name only counts for operator-key use.
  const by = team.ok && team.identity.via === "firebase" ? team.identity.email : ("by" in b && b.by) || "equipo grinflow";
  let next: Registration;
  if (b.action === "verify") {
    if (!reg.location) return NextResponse.json({ ok: false, message: "place it on the map first: it has no coordinates" }, { status: 409 });
    next = { ...reg, status: "verified", verifiedAt: now, verifiedBy: by, updatedAt: now };
  } else if (b.action === "reject") {
    next = { ...reg, status: "rejected", verifiedAt: null, verifiedBy: by, notes: b.notes || reg.notes, updatedAt: now };
  } else {
    next = { ...reg, location: { lat: b.lat, lng: b.lng }, locationSource: reg.locationSource ?? "colonia", area: b.area ?? reg.area, updatedAt: now };
  }
  await store.saveRegistration(next);
  const participants = await refreshLiveNetwork(store);
  return NextResponse.json({ ok: true, registration: next, networkParticipants: participants.length });
}
