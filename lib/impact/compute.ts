import type { Tier } from "../network/types.ts";
import type { Mission } from "../offers/missions.ts";
import type { Offer } from "../offers/types.ts";
import { CO2_FACTOR, WATER_FACTOR } from "./factors.ts";

// Own-data impact (E7). Impact counts ONLY verified receipt: delivered reservations with a
// confirmed receivedKg. Estimates use the documented factors on people-tier kilos; the rest is
// reported as landfill diversion.

export type Delivery = { kg: number; tier: Tier };

export type ImpactSummary = {
  /** Verified kilos the org gave (donor) and received (holder). */
  givenKg: number;
  receivedKg: number;
  givenDeliveries: number;
  receivedDeliveries: number;
  byTierGiven: Record<Tier, number>;
  byTierReceived: Record<Tier, number>;
  /** Non-people verified kilos: diverted from landfill, no CO2 claimed. */
  divertedKg: number;
  co2kg: number;
  waterL: number;
};

const emptyTiers = (): Record<Tier, number> => ({ people: 0, transformation: 0, compost: 0 });
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Delivered lots of one donor offer. Holds, cancelled and unweighed lots never count. */
export function givenFromOffer(offer: Offer): Delivery[] {
  return (offer.case?.reservations ?? [])
    .filter((r) => r.status === "delivered" && r.receivedKg !== null && r.receivedKg > 0)
    .map((r) => ({ kg: r.receivedKg as number, tier: r.tier }));
}

/** One holder mission, tiered through its lot. Unknown tiers never feed the estimates. */
export function receivedFromMission(mission: Mission, offer: Offer | null): Delivery[] {
  if (mission.status !== "completed" || !mission.receivedKg) return [];
  const tier = offer?.case?.reservations.find((r) => r.id === mission.reservationId)?.tier;
  if (!tier) return [];
  return [{ kg: mission.receivedKg, tier }];
}

export function computeImpact(given: Delivery[], received: Delivery[]): ImpactSummary {
  const byTierGiven = emptyTiers();
  const byTierReceived = emptyTiers();
  for (const d of given) byTierGiven[d.tier] += d.kg;
  for (const d of received) byTierReceived[d.tier] += d.kg;
  const givenKg = round1(given.reduce((s, d) => s + d.kg, 0));
  const receivedKg = round1(received.reduce((s, d) => s + d.kg, 0));
  const peopleKg = byTierGiven.people + byTierReceived.people;
  return {
    givenKg,
    receivedKg,
    givenDeliveries: given.length,
    receivedDeliveries: received.length,
    byTierGiven: { people: round1(byTierGiven.people), transformation: round1(byTierGiven.transformation), compost: round1(byTierGiven.compost) },
    byTierReceived: { people: round1(byTierReceived.people), transformation: round1(byTierReceived.transformation), compost: round1(byTierReceived.compost) },
    divertedKg: round1(byTierGiven.transformation + byTierGiven.compost + byTierReceived.transformation + byTierReceived.compost),
    co2kg: round1(peopleKg * CO2_FACTOR.perKg),
    waterL: Math.round(peopleKg * WATER_FACTOR.perKg),
  };
}
