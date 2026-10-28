import { NextResponse } from "next/server";
import { z } from "zod";
import { rankMatches } from "@/lib/engines/match-engine.mjs";

export const runtime = "nodejs";
const Category = z.enum(["panificados", "verduras", "frutas", "lacteos", "abarrotes", "proteina", "organico", "otro"]);
const Condition = z.enum(["unknown", "edible", "past_prime", "inedible"]);
const Offer = z.object({
  id: z.string().max(100).optional(), category: Category, quantity: z.number().positive().max(1_000_000),
  unit: z.string().min(1).max(24), quantityBasis: z.enum(["stated", "estimated", "confirmed", "unknown"]).optional(),
  quantityConfirmed: z.boolean(), condition: Condition, conditionConfirmed: z.boolean(),
  deadline: z.string().min(1).max(64), pickupLocation: z.string().max(300).optional()
}).strict();
const Recipient = z.object({
  id: z.string().min(1).max(100), name: z.string().min(1).max(180), categories: z.array(Category).max(8),
  conditionPolicy: z.array(Condition).max(4), confirmed: z.boolean(), capacity: z.number().nonnegative().max(1_000_000),
  unit: z.string().max(24).optional(), intendedUse: z.string().max(50).optional(), type: z.string().max(50).optional(),
  status: z.string().max(40).optional(), availableUntil: z.union([z.string().max(64), z.number()]).optional(), receivingUntil: z.union([z.string().max(64), z.number()]).optional()
}).strict();
const Transport = z.object({
  id: z.string().min(1).max(100), name: z.string().min(1).max(180), confirmed: z.boolean(), capacity: z.number().positive().max(1_000_000),
  unit: z.string().min(1).max(24), status: z.string().max(40).optional(), availability: z.string().max(40).optional(),
  availableUntil: z.union([z.string().max(64), z.number()]).optional()
}).strict();
const Route = z.object({ verified: z.boolean(), provider: z.string().max(100).optional(), distanceKm: z.number().nonnegative().max(100_000).optional(),
  durationMinutes: z.number().nonnegative().max(1_000_000).optional(), estimatedArrivalAt: z.number().optional(), verifiedAt: z.string().max(64).optional() }).strict();
const Body = z.object({ offer: Offer, recipients: z.array(Recipient).min(1).max(20), transports: z.array(Transport).min(1).max(20), routesByPair: z.record(z.string(), Route).optional(), now: z.number().optional() }).strict();

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const raw = await request.text();
    if (raw.length > 20_000) return NextResponse.json({ ok: false, requestId, error: "payload_too_large", message: "El preview acepta hasta 20 KB por solicitud." }, { status: 413 });
    const input = Body.parse(JSON.parse(raw));
    const results = rankMatches(input);
    return NextResponse.json({ ok: true, requestId, mode: "stateless_demo", persistence: "none", dispatch: "disabled", resultCount: results.length, results });
  } catch (error) {
    const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
    return NextResponse.json({ ok: false, requestId, error: invalid ? "invalid_request" : "preview_failed", message: invalid ? "Revisa el JSON, las unidades, las cantidades y los límites de candidatos." : "No se pudo evaluar el preview." }, { status: invalid ? 400 : 500 });
  }
}
