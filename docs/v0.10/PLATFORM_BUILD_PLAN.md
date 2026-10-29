# GrinFlow — Logistics Platform Build Plan

## Honest status
The repository contains a local-first operations console, synthetic recipient and transport directories, human correction/confirmation, deterministic blockers, local event history, JSON export, a matching engine, a backhaul engine, and a human-interaction module.

It is **not yet a production logistics platform**. The operations backend and database are not connected; authentication, role permissions, messaging, live routing, vehicle reservation, notifications, and real dispatch are not implemented. A package-level test pass does not prove the entire Next.js application builds or that a live Meta request succeeds.

## Phase 0 — reproducible prototype (blocking)
- [ ] Run `npm install` from a clean checkout.
- [ ] Run `npm test`, `npm run typecheck`, and `npm run build`.
- [ ] Fix every build and type error.
- [ ] Open `/`, `/intake` if present, `/platform`, and any flow route confirmed in the repository, on desktop and mobile.
- [ ] Verify offer creation, correction, state transitions, history, and JSON export.
- [ ] Confirm all synthetic data and simulated actions are labelled clearly.
- [ ] Validate Meta access with one intentional, low-cost call only after billing and credit status are confirmed.

**Acceptance:** a reproducible setup and documented results.

## Phase 1 — server-side domain core
- Move state transitions and feasibility validation to server-side functions.
- Add durable operation records and append-only event history.
- Add idempotency and concurrency/version checks.
- Add tests for duplicate submissions, expired requests, unauthorized actions, and provider failures.

## Phase 2 — identity and tenant isolation
- Add authenticated users, organizations, and explicit roles.
- Review and test database row-level security; never trust client-supplied organization IDs.
- Minimize personal data and define retention and deletion policies.

## Phase 3 — one end-to-end supervised workflow
`message → structured draft → evidence review → missing-information request → confirmed offer → candidate matching → human approval → manually confirmed pickup/delivery`

Every step must preserve the source, record who confirmed it, and explain unresolved blockers. No automatic dispatch.

## Phase 4 — real integrations
- Add a routing provider and persist the route response, timestamp, and assumptions.
- Add an authorized messaging channel and explicit consent.
- Integrate transport partners only after confirming terms, availability, capacity, and reservation semantics.
- Track operational outcomes from verified events only.

## Phase 5 — supervised pilot
Start with one partner, one narrow category, one area, and a human operator. Define success metrics before the pilot. Do not scale until the workflow, safety gates, and audit trail are reliable.

## Release gate
A change is not “done” just because unit tests pass. Require clean install, tests, typecheck, build, browser QA, deployment smoke test, provider validation when applicable, independent read-only review, and human owner approval. Clearly state any checks not run.
