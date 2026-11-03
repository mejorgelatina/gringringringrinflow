import { randomUUID } from "node:crypto";
import type { Planner } from "../agent/planner.ts";
import { startRun } from "../agent/loop.ts";
import type { AgentDeps } from "../agent/tools.ts";
import { processIntake, type IntakeDeps, type IntakeOrigin } from "../intake/process.ts";
import {
  assessPhotoLocally,
  resolveCondition,
  routePhotoAssessment,
  type Condition,
  type HumanConfirmation,
  type ObservedCondition,
  type PhotoRouting,
} from "../meta/photo-policy.ts";
import { liveNetwork } from "../network/live.ts";
import { allocateTier, matchResource } from "../network/match.ts";
import { supplyToResource } from "../network/supply.ts";
import type { Offer, OfferGap } from "./types.ts";

// The publish pipeline (E3): one donor message plus up to three photos becomes a persisted offer.
// Every step reuses the production path (processIntake, supplyToResource, matchResource,
// allocateTier, startRun); this module only adds donor ownership, the multi-photo combination,
// the people-tier condition gate, and the persisted evidence. Wiring is injectable so tests run
// the whole pipeline without Meta or Firebase.

export type PublishInput = {
  message: string;
  /** Data URLs, already validated by the route (0-3, each an acceptable image). Never persisted. */
  photos: string[];
  donorUid: string;
  donorRegId: string;
  donorName: string;
  donorRegStatus: string;
  /** The donor explicitly attested "apto para consumo humano" in the form. */
  confirmEdible: boolean;
  /** Registered address of the donor, used only when the message names no place. */
  donorAddress?: string | null;
};

export type PublishWiring = { intake: IntakeDeps; agent: AgentDeps; planner: Planner };

const observedRank: Record<PhotoRouting["suggestedCondition"], number> = { unknown: 0, past_prime: 1, inedible: 2 };

function combineObserved(first: ObservedCondition | null, extras: PhotoRouting["suggestedCondition"][], received: number): ObservedCondition {
  if (received === 0) return "not_assessed";
  const ranked: PhotoRouting["suggestedCondition"][] = [...extras];
  if (first === "unknown" || first === "past_prime" || first === "inedible") ranked.push(first);
  if (ranked.length === 0) return "assessment_failed";
  return ranked.sort((a, b) => observedRank[b] - observedRank[a])[0];
}

export async function publishOffer(input: PublishInput, wiring: PublishWiring): Promise<Offer> {
  const message = input.message.trim();
  const photos = input.photos.slice(0, 3);
  const origin: IntakeOrigin = { donorId: input.donorRegId };

  const intake = await processIntake(message, photos[0], wiring.intake, undefined, "web", origin);

  // Extra photos are assessed individually (the shared intake analyzes the first one). Locally
  // they are accepted without vision; with Meta each one costs exactly one vision call.
  const photoNotes: string[] = [];
  let analyzed = 0;
  let extraMetaCalls = 0;
  const extraObserved: PhotoRouting["suggestedCondition"][] = [];
  if (intake.photo?.status === "assessed") {
    analyzed += 1;
    photoNotes.push(describePhoto(1, intake.photo.routing, intake.photo.provider));
  } else if (intake.photo?.status === "failed") {
    photoNotes.push(`foto 1: no se pudo analizar (${intake.photo.error}).`);
  }
  for (let i = 1; i < photos.length; i += 1) {
    const n = i + 1;
    try {
      if (wiring.intake.useMeta) {
        const assessment = await wiring.intake.assessPhotoWithMeta(photos[i], message);
        extraMetaCalls += 1;
        const routing = routePhotoAssessment(assessment);
        extraObserved.push(routing.suggestedCondition);
        analyzed += 1;
        photoNotes.push(describePhoto(n, routing, "meta"));
      } else {
        const routing = routePhotoAssessment(assessPhotoLocally());
        extraObserved.push(routing.suggestedCondition);
        analyzed += 1;
        photoNotes.push(`foto ${n}: recibida, sin análisis visual (modo local).`);
      }
    } catch {
      photoNotes.push(`foto ${n}: no se pudo analizar.`);
    }
  }
  const firstObserved: ObservedCondition | null = !intake.photo
    ? null
    : intake.photo.status === "assessed" ? intake.photo.routing.suggestedCondition : "assessment_failed";
  const observed = combineObserved(firstObserved, extraObserved, photos.length);

  // The people-tier condition gate: extraction and photos produce evidence, but only the donor's
  // explicit attestation opens the people tier for edible food. A checkbox that contradicts what
  // the donor wrote (stated past_prime/inedible + "apto") is treated as a mistake: the gate stays
  // closed and the offer goes to review instead of routing to people.
  const stated: Condition = intake.supply?.condition ?? "unknown";
  const human: HumanConfirmation | null = input.confirmEdible
    ? { condition: "edible", reviewer: input.donorName, at: new Date().toISOString() }
    : null;
  const contradiction = !!human && (stated === "past_prime" || stated === "inedible");
  let condition = resolveCondition(stated, observed, human);
  if (contradiction) {
    condition = {
      ...condition,
      effective: "unknown",
      peopleRouteBlocked: true,
      reason: "Dijiste que no está apto pero marcaste \"apto para consumo humano\": se necesita revisión antes de rutear.",
    };
  }

  const reviewReasons: string[] = [...intake.extraction.review_reasons];
  const warnings: OfferGap[] = [];
  if (contradiction) reviewReasons.push(condition.reason);
  if (!intake.supply) reviewReasons.push("No se pudo extraer una oferta del texto; un operador debe revisarla.");

  let gaps: OfferGap[] = [];
  let eligible: Offer["eligible"] = [];
  let tier: Offer["tier"] = null;
  if (intake.supply) {
    // The donor's registered address grounds the pickup only when the message names no place.
    const supply = !intake.supply.location && input.donorAddress
      ? { ...intake.supply, location: input.donorAddress }
      : intake.supply;
    const built = supplyToResource(supply, message, intake.icc ?? undefined);
    gaps = built.gaps;
    warnings.push(...built.warnings);
    if (built.resource) {
      built.resource.condition = condition.effective;
      if (condition.effective === "edible" && human?.condition !== "edible") {
        built.resource.conditionConfirmed = false;
        warnings.push({ code: "people_gated", message: "El tier people está cerrado hasta que confirmes que es apto para consumo humano." });
      }
      const matches = matchResource(built.resource, liveNetwork(), built.resource.kg, Date.now());
      eligible = matches.filter((m) => m.eligible)
        .map((m) => ({ participantId: m.participantId, name: m.name, tier: m.tier, zone: m.zone, score: m.score, maxKg: m.maxKg }));
      tier = allocateTier(matches, []);
      if (eligible.length === 0) reviewReasons.push("Sin destino elegible por ahora; un operador debe revisarla.");
    }
  }

  const run = await startRun(message, photos[0], wiring.agent, wiring.planner);
  if (run.proposal && !eligible.some((e) => e.participantId === run.proposal!.recipientId)) {
    warnings.push({ code: "proposal_gated", message: "La propuesta del agente espera confirmación o revisión: su destinatario no está elegible ahora mismo." });
  }

  const supply = intake.supply;
  return {
    id: randomUUID(),
    donorUid: input.donorUid,
    donorRegId: input.donorRegId,
    donorName: input.donorName,
    donorRegStatus: input.donorRegStatus,
    createdAt: new Date().toISOString(),
    status: reviewReasons.length > 0 ? "needs_review" : "open",
    message,
    item: supply?.item ?? null,
    category: supply?.category ?? null,
    quantity: supply?.quantity ?? null,
    unit: supply?.unit ?? null,
    deadlineHour: supply?.deadlineHour ?? null,
    location: supply?.location ?? input.donorAddress ?? null,
    condition,
    photos: { received: photos.length, analyzed, notes: photoNotes },
    icc: intake.icc ? { score: intake.icc.composite.score, band: intake.icc.composite.band } : null,
    gaps,
    warnings,
    reviewNeeded: reviewReasons.length > 0,
    reviewReasons,
    eligible,
    tier,
    proposal: run.proposal,
    agentStatus: run.status,
    agentCode: run.code,
    provider: intake.provider,
    metaCalls: intake.metaCalls + run.metaCalls + extraMetaCalls,
  };
}

function describePhoto(n: number, routing: PhotoRouting, provider: string): string {
  if (provider.includes("Local demo fallback")) return `foto ${n}: recibida, sin análisis visual (modo local).`;
  const verdict = routing.suggestedCondition === "unknown"
    ? "sin evidencia de daño"
    : routing.suggestedCondition === "past_prime" ? "posible daño menor" : "posible daño grave";
  const reasons = routing.reasons.length > 0 ? ` ${routing.reasons.join(" ")}` : "";
  return `foto ${n}: ${verdict}.${reasons}`;
}
