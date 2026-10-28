import { NextResponse } from "next/server";
import { z } from "zod";
import { extractLocally, extractWithMeta } from "@/lib/meta/meta";
import { evaluateCandidates } from "@/lib/engines/matching.mjs";
import { shouldCallMeta } from "@/lib/meta/meta-config.mjs";

const Body = z.object({ message: z.string().trim().min(1).max(5000) });
export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { message } = Body.parse(await request.json());
    // Explicit opt-in is required even when a secret is configured, so previews cannot spend credits.
    const metaEnabled = shouldCallMeta({
      apiKey: process.env.MODEL_API_KEY,
      callsEnabled: process.env.META_CALLS_ENABLED
    });
    const provider = metaEnabled ? "Meta Model API" : "Local demo fallback (Meta calls disabled or key missing)";
    const extraction = metaEnabled ? await extractWithMeta(message) : extractLocally(message);
    const firstSupply = extraction.events.find(e => e.kind === "supply_announced");
    const supply = firstSupply ? {
      category: firstSupply.category,
      quantity: firstSupply.quantity,
      quantityBasis: firstSupply.quantity_basis,
      condition: firstSupply.condition,
      deadlineHour: firstSupply.deadline_hour,
      location: firstSupply.location
    } : null;
    const candidates = supply ? evaluateCandidates(supply) : [];
    return NextResponse.json({ ok: true, requestId, provider, model: metaEnabled ? (process.env.META_MODEL_ID || "muse-spark-1.3") : null, extraction, supply, candidates, dataMode: "synthetic demo", persistence: "client session only" });
  } catch (error) {
    const validation = error instanceof z.ZodError;
    const status = validation ? 400 : 502;
    // Keep provider internals and request content out of the public response.
    if (!validation) console.error(`[intake:${requestId}] provider request failed`, error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({
      ok: false,
      requestId,
      error: validation ? "invalid_request" : "intake_failed",
      message: validation
        ? "Envía un mensaje de hasta 5,000 caracteres."
        : "No se pudo procesar el mensaje. Revisa el acceso al modelo y consulta el request ID con el equipo técnico."
    }, { status });
  }
}
