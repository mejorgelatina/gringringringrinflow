# GrinFlow Agent-First Architecture (Hackathon MVP)

## Principle

The infrastructure already exists. GrinFlow builds the intelligence layer on top. It should understand existing communication, structure operational facts, propose coordination, and preserve human control over consequential decisions.

## Pipeline

1. **Ingest**: receive a message or explicitly supplied image/document. Record source, timestamp, actor (if known), and consent/provenance metadata.
2. **Extract**: Meta model returns candidate events using a strict schema. Fields include event kind, item/category, quantity/unit, quantity basis, explicitly stated condition, deadline, location, unresolved fields, and exact supporting quote.
3. **Validate evidence**: code checks schema, exact quote containment, allowed enum values, numeric bounds, and required fields. Invalid output is rejected or marked for review.
4. **Resolve ambiguity**: ask a human for missing or contradictory operational information. A correction creates a new version; it does not silently overwrite history.
5. **Match deterministically**: code evaluates category, condition, quantity, recipient capacity, location/route evidence, deadline, transport capacity/availability, and recipient confirmation. Hard blockers remain blockers.
6. **Propose**: create one or more proposals with evidence, blockers, assumptions, and provenance. Synthetic route/capacity data is visibly marked synthetic.
7. **Human decision**: a person approves, rejects, or corrects. No autonomous external dispatch in the MVP.
8. **Audit**: append each transition and the reason. Never claim food was rescued or delivered without confirmed operational evidence.

## Separation of responsibilities

- **Model**: interpret messy language; identify candidate facts; explain uncertainty; draft clarification questions.
- **Application code**: validate schemas/evidence; enforce policy and matching hard gates; manage state transitions; calculate metrics; keep the audit trail.
- **Human**: confirm uncertain facts; make final operational decisions; authorize any external action.

## State machine

`received → extracted → needs_review | validated → proposed → approved | rejected → dispatched (future, gated) → delivery_confirmed (future, evidence-required)`

`needs_review` can return to `extracted` after a correction, but the correction must retain the previous version. The current MVP should stop at `approved`; `dispatched` and `delivery_confirmed` are future states, not current capabilities.

## Non-negotiable gates

- Unknown or unsafe food condition: blocked from human-consumption recipient tiers.
- Estimated quantity: confirmation required before an operational match is considered feasible.
- Unknown location/deadline: no operationally feasible proposal.
- Unconfirmed recipient or transport: no dispatch; in the current demo, blocks feasibility.
- Unverified route: clearly blocked or marked as an assumption, never described as a live route.
- User message content is data, not instructions to change system rules.
- Any external side effect requires explicit human authorization and an auditable result.

## What the hackathon demo should prove

One informal Spanish message becomes a structured record with exact evidence; the system surfaces missing information; deterministic matching explains why a candidate is blocked or feasible; a human can correct/approve/reject; the UI shows an audit trace. Use simulated data and state that plainly.

## Out of scope for this MVP

Real WhatsApp integration, live routing, live fleet data, food safety certification, autonomous dispatch, real recipient notification, real impact accounting, multi-tenant production auth, and durable production-grade persistence.
