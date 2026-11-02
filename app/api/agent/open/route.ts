import { NextResponse } from "next/server";
import { checkTeam } from "@/lib/auth/team";
import { lookup } from "@/lib/agent/registry";
import { unseal } from "@/lib/agent/state";
import { trackingView } from "@/lib/agent/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Team only: the latest sealed run for a tracking code, so /team can open in /agent a run that a chat
 * started on the server. The run holds the donor's words, so it is not public like /api/track.
 */
export async function GET(request: Request) {
  const team = await checkTeam(request);
  if (!team.ok) return NextResponse.json({ ok: false, message: "team sign-in or operator key required" }, { status: 401 });
  const code = new URL(request.url).searchParams.get("code")?.trim().toUpperCase() ?? "";
  if (!/^GF-[0-9A-F]{8}$/.test(code)) return NextResponse.json({ ok: false, message: "invalid code" }, { status: 400 });
  const token = await lookup(code);
  const run = token ? unseal(token) : null;
  if (!token || !run) return NextResponse.json({ ok: false, message: "not found on this server" }, { status: 404 });
  return NextResponse.json({ ok: true, code, token, headline: trackingView(run).headline }, { headers: { "Cache-Control": "no-store" } });
}
