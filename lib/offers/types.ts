import type { Proposal } from "../agent/types.ts";
import type { ConditionEvidence } from "../meta/photo-policy.ts";
import type { Tier, Zone } from "../network/types.ts";

// A published offer (E3): one donor lot that went through extraction, ICC and eligibility,
// with the agent's proposal attached. Photos are analyzed, never stored: only the assessments
// survive here, so no image bytes ever reach the database.

export type OfferStatus = "open" | "needs_review" | "closed";

/** One eligible destination, ranked. E4 slices notification waves of 3 from this list. */
export type OfferEligible = {
  participantId: string;
  name: string;
  tier: Tier;
  zone: Zone;
  score: number;
  maxKg: number;
};

export type OfferGap = { code: string; message: string };

export type Offer = {
  id: string;
  /** Owner uid from the verified Firebase token. Server authorization key: only this uid reads it. */
  donorUid: string;
  donorRegId: string;
  donorName: string;
  /** Registration status snapshot at publish time (pending, verified, ...). */
  donorRegStatus: string;
  createdAt: string;
  status: OfferStatus;
  /** What the donor wrote, trimmed. */
  message: string;
  item: string | null;
  category: string | null;
  quantity: number | null;
  unit: string | null;
  deadlineHour: number | null;
  location: string | null;
  /** Stated vs observed vs human-confirmed condition, with the effective routing decision. */
  condition: ConditionEvidence;
  /** Photo evidence only: counts plus assessment notes. Never image bytes. */
  photos: { received: number; analyzed: number; notes: string[] };
  icc: { score: number | null; band: string | null } | null;
  gaps: OfferGap[];
  warnings: OfferGap[];
  reviewNeeded: boolean;
  reviewReasons: string[];
  /** Eligible destinations, best first. Ineligible receivers are never listed, so never notified. */
  eligible: OfferEligible[];
  /** First cascade tier with an eligible destination, or null when nothing is eligible yet. */
  tier: Tier | null;
  /** The agent's proposal. A person still signs off before anything is routed. */
  proposal: Proposal | null;
  agentStatus: string;
  /** Tracking code (GF-…) of the agent run behind this offer. */
  agentCode: string | null;
  provider: string;
  metaCalls: number;
};
