# GrinFlow — Human Interaction Layer
**Product + Technical Addendum · Hackathon v0.2 · 24 October 2026**

> **Core thesis:** The infrastructure already exists. GrinFlow builds the intelligence layer on top.  
> **Product principle:** GrinFlow no mueve comida. Mueve capacidad disponible.

## 1. Executive decision
Treat WhatsApp as a possible channel for a channel-independent **Human Interaction Layer**, not as a standalone chatbot or a mandatory MVP dependency. The backend is the source of truth.

### Build
- Authorized message/photo intake → structured draft with field provenance.
- Deterministic coordination and matching.
- Human clarification, confirmation, authorization, exception handling.
- Auditable decisions and outcomes.

### Do not claim unless implemented
- Real WhatsApp/Meta/Uber integrations.
- Real deliveries or measured food/environmental impact when using synthetic data.
- Food safety, exact weight, expiration, temperature, or storage conditions inferred from images.
- Unlimited autonomous authority.

## 2. Product philosophy → system behavior
| Level | Capability | GrinFlow behavior |
|---|---|---|
| 1. Communication | Capture existing information | Structure authorized messages/photos; preserve field provenance. |
| 2. Coordination | Connect supply and need | Find candidate recipients and explain feasibility/blockers. |
| 3. Logistics | Use existing capacity | Evaluate time windows, routes and capacity; require confirmation of actual availability. |
| 4. Network optimization | Reduce idle capacity | Explore backhauls and underused resources subject to hard constraints and authorization. |

## 3. Human Interaction Layer
Four modes:
1. **Person → agent:** structure an offer and ask only for missing critical fields.
2. **Agent → person:** request confirmation or authorization from the right person.
3. **Person ↔ person, assisted:** escalate exceptions requiring human judgment.
4. **Agent ↔ agent via backend:** exchange typed, structured proposals; never treat free-form model conversation as truth or authorization.

Rules:
- Every contact has an explicit operational reason.
- Contact the authorized role, not merely any available phone number.
- Ask the minimum actionable question.
- Silence is not consent; requests expire and escalate safely.
- Log target/role, question, response, timestamp, evidence and resulting state change.

## 4. MVP demo flow
1. Restaurant sends: “Tenemos pan disponible para donar hoy” (+ optional photo).
2. Model creates a draft and marks quantity/deadline as unknown if absent.
3. Agent asks for missing quantity/deadline; user answers.
4. Donor confirms/corrects the offer.
5. Deterministic engine filters recipients by hard constraints, then ranks feasible options.
6. UI shows one feasible match and blocked alternatives with reasons.
7. Authorized human approves/rejects.
8. Record state transition; label outcome as simulated if no real delivery occurred.

## 5. Architecture proposal
- **Channel adapters:** web UI first; WhatsApp Business later if feasible/authorized.
- **Intake/model adapter:** server-side model call; strict schema validation; model output is a draft, never an action.
- **Domain services:** supply, recipient need, capacity, organizations, permissions and state transitions.
- **Coordination engine:** deterministic hard gates + ranking + explanations.
- **Human Interaction Layer:** clarification/confirmation/approval requests, deadlines, escalation.
- **Event log/persistence:** audit trail, evidence, idempotency, current state.

Reuse the actual repository stack after inspecting it. These are proposed responsibilities and endpoint sketches, not verified existing code.

## 6. Domain contract
- `Supply`: donor, item type, quantity/unit, availability window, deadline, pickup location, storage requirements, status.
- `FieldEvidence`: entity, field, value, source type/reference, reporter, observed/verified timestamps.
- `RecipientNeed`: recipient, acceptable item types, quantity, receiving window, location, storage capacity.
- `Capacity`: provider, capacity type/amount, time window, route constraints, status.
- `MatchProposal`: supply, recipient, optional capacity, feasibility, blockers, score breakdown, expiry.
- `InteractionRequest`: entity, reason, target actor, channel, question, allowed responses, expiry, status.
- `DecisionEvent`: actor, action, entity, prior/next state, timestamp, evidence reference.

Field provenance values: `model_extracted`, `donor_reported`, `human_confirmed`, `measured`, `system_derived`. Unknown is not zero; model confidence is not verification.

## 7. State machine
`DRAFT → NEEDS_CLARIFICATION → PENDING_CONFIRMATION → AVAILABLE → RESERVED → COLLECTED → DELIVERED`

Exception states: `REJECTED`, `EXPIRED`, `CANCELLED`, `BLOCKED`. No reservation without authorization from the appropriate role.

## 8. Matching
**Hard gates first, ranking second.** A high score cannot compensate for violating a hard constraint.
- Food compatibility and recipient acceptance.
- Pickup/delivery window and deadline.
- Confirmed receiving/storage capacity.
- Transport availability and route constraints.
- Permissions, consent and current supply status.
- Then rank by travel time/distance, urgency, useful quantity, estimated cost and idle-capacity reuse.

## 9. Proposed API sketch (not verified)
- `POST /api/intake`
- `POST /api/supplies/{id}/confirm`
- `GET /api/matches?supplyId={id}`
- `POST /api/interactions/{id}/respond`
- `POST /api/proposals/{id}/decision`
- `GET /api/events?entityId={id}`

Every sensitive operation requires authorization, expected-state validation, idempotency and an audit event.

## 10. Essential tests
- Clear offer; photo without quantity; ambiguous/conflicting offer.
- Expired deadline; incompatible recipient storage/window; unconfirmed transport.
- Unauthorized agent action; duplicate response/webhook.
- No human response (expiry/escalation; never implicit consent).
- Model timeout or invalid JSON (safe fallback).

## 11. 2–3 minute demo
- 0:00–0:20: fragmented coordination problem + incoming offer.
- 0:20–0:45: structured draft, visible missing fields.
- 0:45–1:05: simulated WhatsApp clarification and response.
- 1:05–1:35: three synthetic recipients; one feasible, two blocked with reasons.
- 1:35–2:00: human approval/rejection.
- 2:00–2:30: audit event, state transition, “simulated outcome” label.

## 12. Schedule
| Date | Objective | Verifiable output |
|---|---|---|
| Oct 24–25 | Preflight | Inspect repo; verify event rules/model access; define demo data. |
| Oct 26 | Kickoff + technical proof | One server-side model call; manage overlap with fundraising event. |
| Oct 27–28 | Intake + persistence | Message/photo → schema-valid draft with provenance. |
| Oct 29–30 | Matching | One feasible proposal and two explained blockers. |
| Oct 31–Nov 1 | Human Interaction Layer | Clarification/confirmation/approval; real channel only if viable. |
| Nov 2 | End-to-end QA | Stable flow and controlled errors. |
| Nov 3 | Submission assets | Video, README, screenshots, architecture and reproducible metrics. |
| Nov 4 | Submit | Target 20:00 Mexico City time, subject to official rules. |

## 13. Immediate actions
1. Inspect the actual GrinFlow repository before suggesting file-level edits.
2. Verify current hackathon model/API access, submission format and official deadline.
3. Use one scenario, one offer, three synthetic recipients, two capacity options, one approval request.
4. Implement data contract/state/matching before polishing the model integration.
5. Keep WhatsApp as an adapter; clearly label a simulated interaction if no real integration exists.

**Positioning:** GrinFlow coordinates surplus food, recipient needs and underused logistics capacity through the tools people already use.

**Status:** This is a product/technical proposal, not evidence that code, WhatsApp integration, model calls, or real deliveries are already implemented.
