import { NextResponse } from "next/server";
import { z } from "zod";
import { evaluateBackhaul } from "@/lib/engines/backhaul.mjs";

export const runtime = "nodejs";
const Category = z.enum(["panificados", "verduras", "frutas", "lacteos", "abarrotes", "proteina", "organico", "otro"]);
const Condition = z.enum(["unknown", "edible", "past_prime", "inedible"]);
const Body = z.object({
  trip: z.object({ vehicleConfirmed: z.boolean(), originalDeliveryConfirmed: z.boolean(), capacity: z.number().positive().max(1_000_000), loadAfterDropoff: z.number().nonnegative().max(1_000_000), availableUntil: z.union([z.string().max(64), z.number()]), transportPermissionConfirmed: z.boolean() }).strict(),
  offer: z.object({ id: z.string().max(100).optional(), category: Category, quantity: z.number().positive().max(1_000_000), quantityConfirmed: z.boolean(), condition: Condition, conditionConfirmed: z.boolean(), deadline: z.union([z.string().max(64), z.number()]), donorConfirmed: z.boolean(), shareConsent: z.boolean() }).strict(),
  recipient: z.object({ id: z.string().max(100).optional(), categories: z.array(Category).max(8), conditionPolicy: z.array(Condition).max(4), intendedUse: z.string().max(50).optional(), type: z.string().max(50).optional(), confirmed: z.boolean() }).strict(),
  route: z.object({ verified: z.boolean(), provider: z.string().max(100).optional(), pickupEta: z.union([z.string().max(64), z.number()]).optional(), deliveryEta: z.union([z.string().max(64), z.number()]).optional(), incrementalKm: z.number().nonnegative().max(100_000).optional(), emptyKmAvoided: z.number().nonnegative().max(100_000).optional(), incrementalMinutes: z.number().nonnegative().max(1_000_000).optional(), verifiedAt: z.string().max(64).optional() }).strict(),
  now: z.number().optional()
}).strict();

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const raw = await request.text();
    if (raw.length > 20_000) return NextResponse.json({ ok: false, requestId, error: "payload_too_large", message: "El preview acepta hasta 20 KB por solicitud." }, { status: 413 });
    const input = Body.parse(JSON.parse(raw));
    const result = evaluateBackhaul(input);
    return NextResponse.json({ ok: true, requestId, mode: "stateless_demo", persistence: "none", driverContact: "disabled", dispatch: "disabled", result });
  } catch (error) {
    const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
    return NextResponse.json({ ok: false, requestId, error: invalid ? "invalid_request" : "preview_failed", message: invalid ? "Revisa el JSON y los datos obligatorios del viaje, oferta, destino y ruta." : "No se pudo evaluar la oportunidad de retorno." }, { status: invalid ? 400 : 500 });
  }
}
