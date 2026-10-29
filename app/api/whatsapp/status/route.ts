import { NextResponse } from "next/server";
import { whatsappStatus } from "@/lib/whatsapp/context";
import { recentTraces } from "@/lib/whatsapp/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Booleans only (never values), plus this instance's recent traces with masked numbers and no message text. */
export async function GET() {
  return NextResponse.json({ ok: true, config: whatsappStatus(), traces: recentTraces() });
}
