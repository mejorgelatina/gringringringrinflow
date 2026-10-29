import { NextResponse } from "next/server";
import { lookup } from "@/lib/agent/registry";
import { unseal } from "@/lib/agent/state";
import { trackingView } from "@/lib/agent/tracking";

export const runtime = "nodejs";

/** Look up a collection by tracking number. Returns the public tracking view only, never the run's conversation. */
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!/^gf-[0-9a-f]{8}$/i.test(code.trim())) return NextResponse.json({ ok: false, error: "invalid_code", message: "a tracking number looks like gf-1a2b3c4d." }, { status: 400 });
  const token = await lookup(code);
  const run = token ? unseal(token) : null;
  if (!run) return NextResponse.json({ ok: false, error: "not_found", message: "we couldn't find that tracking number on this server. if you started it in this browser, it's in your recent collections." }, { status: 404 });
  return NextResponse.json({ ok: true, tracking: trackingView(run) });
}

/** Same view for a run the browser holds (sealed), so a code from this browser always resolves. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const run = typeof body?.token === "string" ? unseal(body.token) : null;
  if (!run) return NextResponse.json({ ok: false, error: "invalid_state", message: "this collection could not be verified." }, { status: 400 });
  return NextResponse.json({ ok: true, tracking: trackingView(run) });
}
