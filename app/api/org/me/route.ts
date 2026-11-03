import { NextResponse } from "next/server";
import { authorizeOrg } from "@/lib/auth/org";
import { publicRegistration } from "@/lib/registry/display";
import { registryStore } from "@/lib/registry/store";

export const runtime = "nodejs";

/** The caller's own registration, if any. Only the owner uid from the verified token can read it. */
export async function GET(request: Request) {
  const auth = await authorizeOrg(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  const reg = await registryStore().findRegistrationByOwner(auth.identity.uid);
  if (!reg) return NextResponse.json({ ok: false, error: "no-registration" }, { status: 404 });
  return NextResponse.json({ ok: true, registration: publicRegistration(reg) });
}
