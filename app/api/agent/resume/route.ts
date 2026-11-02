import { registryStore } from "@/lib/registry/store";
import { refreshLiveNetwork } from "@/lib/registry/network";
import { NextResponse } from "next/server";
import { z } from "zod";
import { agentWiring } from "@/lib/agent/deps";
import { ResumeError, resumeRun } from "@/lib/agent/loop";
import { lookup, remember } from "@/lib/agent/registry";
import { trackingView } from "@/lib/agent/tracking";
import { seal, stateSigned, unseal } from "@/lib/agent/state";
import { approvalReply } from "@/lib/whatsapp/approval-reply";
import { notifyApproval } from "@/lib/whatsapp/approval";
import { liveOutbound } from "@/lib/whatsapp/context";
import { publicBaseUrl } from "@/lib/whatsapp/agent-bridge";
import { publicNotice } from "@/lib/whatsapp/notify";

const Action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("donor_reply"), text: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal("decision"), decision: z.enum(["approved", "rejected"]), reviewer: z.string().trim().min(2).max(80), notes: z.string().trim().max(500).default("") }),
  z.object({ type: z.literal("inspection"), condition: z.enum(["edible", "past_prime", "inedible"]), reviewer: z.string().trim().min(2).max(80), quantity: z.number().positive().max(100000).optional(), weightKg: z.number().positive().max(100000).optional(), note: z.string().trim().max(500).optional() }),
  z.object({ type: z.literal("continue") })
]);
const Body = z.object({ token: z.string().min(10).max(2_000_000), action: Action });
export const runtime = "nodejs";

/** A person moves a stopped run: the donor answers, an operator inspects, approves or rejects. */
export async function POST(request: Request) {
  // Verified registrations join the network every channel evaluates against.
  await refreshLiveNetwork(registryStore());
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request", message: "That action is not valid for this run." }, { status: 400 });
  const run = unseal(parsed.data.token);
  if (!run) return NextResponse.json({ ok: false, error: "invalid_state", message: "This run could not be verified. Start a new one." }, { status: 400 });
  // The donor may have answered on WhatsApp since this browser got its copy: never act on an older state.
  const latest = await lookup(run.code).then(t => (t ? unseal(t) : null)).catch(() => null);
  if (latest && latest.id === run.id && latest.turns.length > run.turns.length) {
    return NextResponse.json({ ok: false, error: "stale_state", message: "this collection moved on (the donor answered on whatsapp). reopen it from /team to see the latest state.", token: seal(latest), run: latest, tracking: trackingView(latest) }, { status: 409 });
  }
  const { deps, planner } = agentWiring();
  // resumeRun moves the run in place, so remember where it was.
  const wasApproved = run.status === "approved";
  try {
    const next = await resumeRun(run, parsed.data.action, deps, planner);
    const token = seal(next);
    await remember(next.code, token);
    const origin = new URL(request.url).origin;
    const whatsappReply = next.status === "approved" ? approvalReply(next.code, origin) : null;
    let notices: ReturnType<typeof publicNotice>[] = [];
    if (next.status === "approved" && !wasApproved) {
      try { notices = (await notifyApproval(next, registryStore(), liveOutbound(), publicBaseUrl() ?? origin)).map(publicNotice); }
      catch (error) { console.error("approval notices failed", error); }
    }
    return NextResponse.json({ ok: true, run: next, token, tracking: trackingView(next), stateSigned: stateSigned(), whatsappReply, notices });
  } catch (error) {
    if (error instanceof ResumeError) return NextResponse.json({ ok: false, error: "invalid_action", message: error.message }, { status: 409 });
    throw error;
  }
}
