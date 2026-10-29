import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmIntake } from "@/lib/intake/process";

const ConditionEnum = z.enum(["edible", "past_prime", "inedible", "unknown"]);
const Body = z.object({
  supply: z.object({
    category: z.string().nullable(),
    quantity: z.number().nonnegative().nullable(),
    quantityBasis: z.enum(["stated", "estimated", "confirmed"]).nullable(),
    condition: ConditionEnum,
    deadlineHour: z.number().int().min(0).max(23).nullable(),
    location: z.string().max(200).nullable()
  }),
  stated: ConditionEnum,
  observed: z.enum(["unknown", "past_prime", "inedible", "not_assessed", "assessment_failed"]),
  confirmation: z.object({
    condition: z.enum(["edible", "past_prime", "inedible"]),
    reviewer: z.string().trim().min(2).max(80),
    note: z.string().trim().max(500).optional()
  }),
  quantity: z.number().positive().max(100000).optional()
});
export const runtime = "nodejs";

/** Human review step. Deterministic only: no model call, no dispatch. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request", message: "A reviewer name and a confirmed condition are required." }, { status: 400 });
  const { supply, stated, observed, confirmation, quantity } = parsed.data;
  const at = new Date().toISOString();
  const result = confirmIntake(supply, stated, observed, { ...confirmation, at }, quantity);
  return NextResponse.json({ ok: true, ...result, audit: { reviewer: confirmation.reviewer, at, decision: confirmation.condition, quantity: quantity ?? null, modelObservation: observed } });
}
