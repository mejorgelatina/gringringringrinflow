# GrinFlow — Agent-First Product Blueprint
**Greenfield architecture · Product thesis · MVP definition · v0.1 · 25 October 2026**

> **Thesis:** GrinFlow coordinates surplus food, recipient needs and underused logistics capacity through the tools people already use.  
> **Operating principle:** Autonomy within explicit permissions; human intervention when judgment, confirmation or authorization is needed.  
> **Architecture decision:** Design as greenfield. Reuse legacy code only after the new architecture is defined and only when it lowers delivery cost without distorting the design.

## Executive summary
GrinFlow is reframed from a conventional food-donation management app with AI features into an agent-first coordination system. Agents structure information, identify opportunities, propose matches, request confirmations and coordinate next steps. A deterministic core validates feasibility, permissions and state transitions. Humans intervene when facts are missing, judgment is required or an action needs approval.

This is a clean-sheet blueprint, not evidence that code, APIs, WhatsApp integration or live operations already exist.

## Design principles
1. Agent-first, not agent-only.
2. Channel-independent; no messaging channel is the source of truth.
3. State before conversation: only validated commands change canonical state.
4. Typed agent contracts, not free-form agent-to-agent improvisation.
5. Deterministic hard constraints; LLMs extract, summarize and propose.
6. Evidence and provenance for critical fields.
7. Least authority for each agent/tool.
8. Silence is not consent.
9. Every proposal, approval, exception and state change is observable.
10. Greenfield design; selective reuse after evaluating legacy components.

## Role-scoped agents
- **Intake Agent:** interpret authorized messages/photos; create a draft and identify unknown fields. Cannot invent safety facts or publish unconfirmed supply.
- **Coordination Agent:** retrieve candidates and explain blockers. Cannot override hard constraints or reserve alone.
- **Donor/Recipient Liaison:** send focused clarification or confirmation to an authorized person.
- **Logistics Capability Agent:** represent possible capacity; cannot claim unconfirmed transport is available.
- **Orchestrator:** workflow, deadlines, retries, idempotency and handoffs.
- **Policy/Validation Core:** schema, feasibility, permissions and state transitions.

MVP: Intake + deterministic coordination engine + orchestrator + one human interaction mechanism. These can be modules, not separate services.

## Canonical workflow
1. Ingest authorized message/photo.
2. Interpret into a structured draft; unknown remains unknown.
3. Clarify critical missing fields.
4. Confirm/correct the draft.
5. Discover active recipient needs and confirmed capacity.
6. Filter by hard constraints; explain infeasible options.
7. Rank only feasible options.
8. Create an expiring proposal.
9. Obtain required authorization.
10. Commit atomically with state transition and audit event.
11. Track execution only where real.
12. Close with verified outcome, failure or cancellation.

## Human interaction
Each request has a reason code, target role, question, valid responses, expiry and explicit downstream effect. Silence is not consent. Start with web UI or a clearly simulated WhatsApp conversation if real Business integration is not ready and authorized. A real connector must handle identity, consent, context, webhook retries and role permissions.

## Architecture
| Layer | Responsibility |
|---|---|
| Channel adapters | Web, simulated chat, later WhatsApp/partner channels |
| Application API | Auth, commands/queries, limits |
| Orchestrator | Workflow, deadlines, retries, expirations |
| Agent runtime | Bounded model/tool calls |
| Coordination core | Deterministic constraints, ranking, explanations |
| Domain/policy | Entities, permissions, invariants, transitions |
| Persistence/event log | Canonical state, evidence, audit history |
| Observability | Errors, latency, failed transitions, metrics |

One deployable app/API is enough for MVP. Use the available relational DB; don't introduce infrastructure without need.

## Domain model
- `Organization`: type, name, verification, service area, policies.
- `Actor`: organization, role, channel identities, permissions, identity status.
- `SupplyOffer`: donor, category, quantity/unit, availability/deadline, pickup location, handling constraints, status.
- `SupplyEvidence`: entity/field/value, source type/reference, actor, observed/verified timestamps.
- `RecipientNeed`: acceptable categories, quantity, receiving window/location, capacity/handling constraints.
- `LogisticsCapacity`: provider, capacity, route/service area, availability window, confirmation status/evidence.
- `MatchProposal`: supply, recipient, optional capacity, feasibility, blockers, score breakdown, expiry.
- `InteractionRequest`: entity, reason, target actor/role, channel, question, allowed responses, expiry/status.
- `DecisionEvent`: actor/action/entity, prior/next state, timestamp, evidence, idempotency key.
- `Operation`: committed participants, milestones, exceptions and outcome.

Unknown is not zero. Proposed is not confirmed. Confirmed is not necessarily independently verified. Planned is not completed.

## State and authority
Supply lifecycle: `DRAFT → NEEDS_CLARIFICATION → PENDING_CONFIRMATION → AVAILABLE → RESERVED → COLLECTED → DELIVERED`. Exceptions: `REJECTED`, `EXPIRED`, `CANCELLED`, `BLOCKED`, `FAILED`.

Autonomy tiers: T0 observe authorized information; T1 draft; T2 recommend; T3 request confirmation; T4 commit after explicit approval and checks; T5 autonomous execution is out of MVP.

## Provenance and model boundaries
Use `model_extracted`, `donor_reported`, `human_confirmed`, `measured`, `system_derived`. A model cannot infer exact weight, expiration, temperature, storage history or food safety from a photo. Validate strict schemas, keep credentials server-side and fail safely. Untrusted messages cannot override policy or permissions.

## Matching
Hard gates first, ranking second. Gates include food compatibility, active supply, deadlines, pickup/receiving windows, handling/storage constraints, recipient acceptance, confirmed capacity and permissions. Missing evidence blocks or requests confirmation. Rank only feasible options by travel time, urgency, quantity fit, cost and idle/backhaul capacity reuse.

## Proposed API (not existing endpoints)
- `POST /api/intake`
- `POST /api/supplies/{id}/confirm`
- `GET /api/supplies/{id}/matches`
- `POST /api/interactions/{id}/respond`
- `POST /api/proposals/{id}/decision`
- `GET /api/operations/{id}/events`

State-changing commands require permission checks, expected-state validation, idempotency and audit events.

## Hackathon MVP
One supply offer → one human clarification → deterministic match with blockers → one explicit approval → auditable simulated outcome. Use one donor, three synthetic recipients, two synthetic capacity options, one viable proposal and two blocked alternatives. Label synthetic actors/capacities/outcomes clearly.

## Acceptance tests
- Offer structured with field provenance.
- Missing field creates clarification, not an invented value.
- Correction preserves history.
- Expired deadline/incompatible window blocks a proposal.
- Unconfirmed transport is not treated as available.
- Unauthorized actor cannot approve/reserve.
- Duplicate webhook/reply doesn't duplicate commitment.
- No reply expires/escalates; never means approval.
- Model timeout/invalid output fails safely.
- Every proposal explains blockers and ranking factors.

## Execution plan
A. Choose one demo scenario and actor permissions.  
B. Build new domain types, state machine, seed data and API shell.  
C. Implement hard-gate matching and explanations.  
D. Implement interaction lifecycle, response validation, expiry and audit.  
E. Connect the Meta model/API actually available to the participant.  
F. Build conversation intake, match comparison and timeline.  
G. Stabilize tests, README, video, screenshots and simulation labels.

## Legacy reuse policy
Don't read every old file first. Define greenfield skeleton/contracts, then inspect only likely reusable components. Reuse if it solves a required capability, is verifiable and can be wrapped cleanly. Rebuild if adaptation costs more or embeds conflicting assumptions.

## Positioning
**GrinFlow coordinates surplus food, recipient needs and underused logistics capacity through the tools people already use.**

Food redistribution already has donors, recipients, communication channels and transport resources. The missing layer is shared operational intelligence. GrinFlow turns fragmented signals into structured offers, identifies feasible matches, coordinates commitments and brings people into the loop when confirmation or judgment is needed.

## Open decisions
- Which Meta model/API is actually accessible to the participant?
- First channel: web chat or real authorized WhatsApp Business?
- Which roles can confirm supply, accept a match and approve transport?
- What minimum facts are required before `AVAILABLE`?
- Which demo actions are simulated and how are they labelled?
