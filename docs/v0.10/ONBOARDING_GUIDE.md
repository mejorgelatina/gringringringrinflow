# GrinFlow — Contributor Onboarding Guide

**Project:** AI-assisted food-surplus coordination prototype  
**Status:** Hackathon prototype, not a production rescue operation.

## 1. What we are building
GrinFlow turns fragmented operational information—informal messages, spreadsheets, and communications among donors, recipient organizations, and transport providers—into verifiable coordination proposals.

**Core idea:** *The infrastructure already exists. We're building the intelligence layer on top.*

We are not trying to replace WhatsApp, phone calls, spreadsheets, human relationships, vehicles, or working processes overnight. We want to help a network understand what resources exist, who needs them, what capacity is available, and which next step may be viable.

A useful internal shorthand is: **GrinFlow does not move food. It coordinates available capacity.** In this MVP, that is a product thesis, not a claim that real transport is already coordinated.

## 2. The problem
The information needed to coordinate surplus is fragmented: item, quantity, declared condition, pickup location, deadline, eligible recipient, and available transport. Some details live in messages; others live in people's memory. Coordination costs time because someone must discover missing facts, detect incompatibilities, ask follow-up questions, and synchronize participants.

The problem is not “AI decides what to do with food.” It is **helping coordinators move from ambiguous messages to understandable proposals with evidence, explicit blockers, and human approval.**

## 3. Architecture
`Browser UI → POST /api/intake → Meta adapter or clearly labelled local fallback → schema/evidence validation → deterministic feasibility and matching → human decision → local session audit trail`

- The model extracts candidate facts; it does not authorize actions.
- Zod and evidence checks validate the shape and source grounding.
- Deterministic rules apply hard constraints.
- A person makes the decision.
- The current UI stores demo data locally; it is not shared or durable server storage.

## 4. Routes
- `/` — message intake and proposal demo.
- `/platform` — local-first logistics console.
- `POST /api/intake` — extraction and feasibility preview.
- `POST /api/demo/match-preview` — stateless synthetic matching preview.
- `POST /api/demo/backhaul-preview` — stateless synthetic return-trip preview.

## 5. Run locally
Requires Node.js 20+ and npm.

```bash
npm install
cp .env.example .env.local
npm test
npm run dev
```

Open `http://localhost:3000`. The local fallback is used unless `MODEL_API_KEY` is configured **and** `META_CALLS_ENABLED=true` is explicitly set. Keep the flag false for previews. Read `META_BILLING_AND_ACCESS.md` before making any live inference request.

Useful checks:

```bash
npm run typecheck
npm run build
npm run smoke:meta
```

The default Meta smoke command lists models and makes zero inference calls. `--basic` and `--structured` each make one inference call; `--all` makes two.

## 6. Critical safety rules
- Never represent local fallback output as a Meta response.
- Preserve source text and distinguish stated, estimated, and verified values.
- Unknown condition or unconfirmed quantity must not silently become verified.
- A high score never overrides hard blockers.
- A “feasible” result is based on synthetic assumptions, not live route or capacity data.
- No real-world action may be triggered without explicit human authorization.
- Never claim impact without verified operational evidence.

## 7. Known limits
There is no durable database, authentication, authorization, live map provider, WhatsApp integration, driver contact, vehicle reservation, dispatch, or impact measurement. The proposed SQL migrations are design artifacts and must be reviewed and tested before use.

## 8. Contribution workflow
1. Make a small, scoped change.
2. Run focused tests, then the full test suite.
3. Run typecheck and build where dependencies are available.
4. Ask a separate read-only verifier to inspect the diff and test evidence.
5. Address findings and rerun tests.
6. Require human approval before merge or deployment.

See `BUILDER_AGENT_PROMPT.md`, `VERIFIER_AGENT_PROMPT.md`, and `REVIEW_HANDOFF_CHECKLIST.md`.
