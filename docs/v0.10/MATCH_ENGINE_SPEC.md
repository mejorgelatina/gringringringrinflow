# Deterministic Matching Engine — Specification

## Purpose
Evaluate recipient/transport candidates against hard operational constraints before ranking eligible options. Scores are for ordering eligible candidates only; they cannot override a blocker.

## Core gates
- Offer category and quantity are present and quantity is confirmed.
- Declared condition is known; human confirmation is required for sensitive transitions.
- Recipient is confirmed, accepts the category, has capacity, and has a compatible condition policy and receiving window.
- Transport is confirmed, has sufficient capacity, and is available for the required time window.
- Pickup/delivery route is explicitly verified. A synthetic or missing route is not operationally verified.
- Required consent and authorization are present.

## Output
Return candidate identity, eligibility, score when eligible, and explicit blocker codes/messages. Preserve the facts and evidence used for each decision so a human can review them.

## Boundaries
The current engine is deterministic and tested with synthetic cases. It does not call maps, reserve capacity, message participants, or dispatch a vehicle. Production must repeat all critical validation server-side and record the rule/version used.
