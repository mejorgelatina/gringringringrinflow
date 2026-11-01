import type { Extraction } from "../meta/types.ts";
import type { ConditionEvidence } from "../meta/photo-policy.ts";
import type { PhotoResult, Supply } from "../intake/process.ts";

/** Conversation items in the Meta Responses API shape: the planner sees exactly what happened, turn by turn. */
export type AgentItem =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

export type AgentStatus =
  | "running"
  | "needs_input" // waiting for the donor's answer; no model calls until it arrives
  | "awaiting_approval" // a proposal passed every check; an operator decides
  | "escalated" // handed to an operator (inspection needed, or three refused proposals)
  | "approved" // operator signed off; still a simulated action
  | "paused"; // turn limit or a failed model call

export type Candidate = { recipientId: string; recipient: string; tier: string; capacityId: string; capacity: string; routeKm: number | null; feasible: boolean; blockers: { code: string; label: string }[]; warnings?: { code: string; label: string }[] };

export type Proposal = { recipientId: string; capacityId: string; recipient: string; capacity: string; tier: string; routeKm: number | null; rationale: string; quotes: string[]; judge: { by: string; supported: boolean; note: string } };

export type Turn = { n: number; at: string; tool: string; args: Record<string, unknown>; outcome: "ok" | "refused" | "stopped"; summary: string; check?: string };

export type AgentRun = {
  id: string;
  /** Short public reference for this collection, like a parcel tracking number. */
  code: string;
  createdAt: string;
  status: AgentStatus;
  planner: string;
  /** Everything the donor wrote, in order. The only source a quote may come from. */
  donorTexts: string[];
  extractedTexts: number;
  hasPhoto: boolean;
  extraction: Extraction | null;
  supply: Supply | null;
  /** Bumped on every supply change, so stale match results can't back a proposal. */
  supplyVersion: number;
  photo: PhotoResult | null;
  condition: ConditionEvidence | null;
  /** ICC characterization of the current offer, rebuilt whenever the offer, photo or inspection changes. */
  icc?: import("../icc/types.ts").IccRecord | null;
  candidates: Candidate[] | null;
  candidatesVersion: number;
  question: { field: string; text: string } | null;
  asks: number;
  handoff: string | null;
  proposal: Proposal | null;
  /** Pairs an operator already turned down in this run, as "recipientId+capacityId". */
  rejectedPairs: string[];
  refusals: number;
  review: { decision: "approved" | "rejected"; reviewer: string; notes: string; at: string } | null;
  turns: Turn[];
  items: AgentItem[];
  turnLimit: number;
  metaCalls: number;
  note: string | null;
  /** Opened in the resource network after sign-off: hold, delivery choice, handoff code. Simulated. */
  operation?: import("../network/supply.ts").OperationSummary | null;
};
