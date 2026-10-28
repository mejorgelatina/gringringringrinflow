# GrinFlow — Meta Hackathon Prototype v0.6

**Product thesis:** The infrastructure already exists. We're building the intelligence layer on top.  
**Status:** improved prototype scaffold; deterministic tests pass, but clean install/build, browser runtime, live Meta API, and deployment are not yet verified.

## Current release

This package is v0.6. The core app scaffold and matching logic are unchanged from v0.5; this release adds Spanish onboarding, a detailed execution plan, and a contributor task board. It does not claim that live Meta inference or a deployment has been verified.

## What this version adds
- A Next.js App Router demo UI for message intake → structured draft → evidence/review → deterministic feasibility → explicit human decision → session audit trail.
- A server-side Meta Model API adapter using `https://api.meta.ai/v1` and `muse-spark-1.3` by default.
- A clearly labelled local demo fallback when no API key is configured. It is not a Meta model call and must not be represented as one.
- A deterministic matcher with hard blockers and synthetic recipients/transport capacities.
- Node test coverage for critical safety/feasibility invariants (47 tests currently pass in this package revision).
- Synthetic route assumptions so a pickup in Roma can match a recipient in Centro without incorrectly requiring pickup and delivery to be in the same neighborhood. Unknown routes remain blocked.
- Server-side request IDs, bounded API timeout, no automatic SDK retries, and sanitized public API errors.
- `META_OFFICE_HOURS_QUESTIONS.md` with ranked questions for Meta, including model availability, structured output, deployment, and credits.
- `META_BILLING_AND_ACCESS.md` with the official billing/access steps shared by Meta, a diagnostic decision tree, and the distinction between direct API and partner model IDs.
- `npm run smoke:meta` diagnostic script that separates model listing, basic inference, and JSON Schema structured-output support without printing the API key.
- `DEPLOYMENT_GUIDE.md` for Vercel + public GitHub setup.
- Explicit synthetic-data and simulated-outcome messaging.

## Run locally
Requires Node.js 20+ (recommended) and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The app uses the local fallback unless both `MODEL_API_KEY` is configured and `META_CALLS_ENABLED=true` is explicitly set. Keep the flag `false` for previews. To test Meta, first follow `META_BILLING_AND_ACCESS.md`: a payment method is required and credits must be visible on Billing before inference calls. `npm run smoke:meta` intentionally makes two inference requests and may consume credits; run it only when you choose to test.

```bash
npm test
npm run build
```

## Golden-set evaluation
The original 30-case Spanish golden set is preserved at `tests/golden-set.json`. Start the app, then run `npm run evaluate` (or set `GRINFLOW_BASE_URL`) to generate `golden-eval-report.json` in the current working directory. The harness compares expected fields exactly; it is not a calibrated benchmark, and safety-critical false positives must be reviewed individually. The evaluation has been wired but has **not yet been run against a live Meta model**.

## Demo scenario
Default message: `Tenemos 20 cajas de pan fresco en la colonia Roma, hay que recogerlas antes de las 6 pm.`

The local fallback should extract declared quantity 20, category panificados, explicitly stated freshness, pickup area Roma, and 18:00 deadline. The deterministic engine should show the community kitchen as a potentially feasible option and block incompatible/unconfirmed transport alternatives. This is synthetic data and does not represent an actual organization or route.

## Important boundaries
- No database or durable persistence; decisions are stored only in the browser's current React session.
- No authentication/authorization, real WhatsApp, Uber, donor, recipient, or transport integrations.
- No real reservation, dispatch, pickup, delivery, or impact measurement.
- No food-safety certification. The app only records stated condition; unknown condition is blocked for people-tier destinations.
- A “feasible” result is a demo proposal based on synthetic assumptions, not proof of real-world feasibility.
- The local fallback uses regex heuristics for a few demo patterns; it is not a replacement for the Meta model or the 30-case evaluation suite. The route distances are synthetic assumptions and not live routing data.
- API response shape, model ID and structured-output support must be verified with the hackathon account. A live model call has not yet been confirmed.

## Architecture
`Browser UI → POST /api/intake → Meta adapter (or explicitly labelled local fallback) → Zod schema + exact-quote check → deterministic matcher → browser renders proposal/blockers → human decision → session audit trail`

The LLM extracts. The deterministic core validates. A person decides. The UI never claims to execute an operation.

## Suggested next steps
1. Verify the first live Meta call and record a sanitized success/error result.
2. Import the existing 30-case golden set and evaluate extraction accuracy with a repeatable script.
3. Add clarification state and correction handling; preserve prior values rather than overwriting history.
4. Add durable event log + idempotency only after selecting the repository/database.
5. Add tests for unauthorized actions, duplicate submissions, expired requests, and model failures.
6. Capture the 3-minute demo and clearly identify the hackathon-built functionality.

## Official references to re-check
- https://dev.meta.ai/help/billing/set-up-billing
- https://dev.meta.ai/help/billing/payment-failure
- https://dev.meta.ai/support
- https://dev.meta.ai/docs/quickstart
- https://dev.meta.ai/docs/authentication
- https://github.com/meta-models/meta-model-cookbook
- https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details

## Meta workshop research and agent design

- `META_WORKSHOP_TO_GRINFLOW.md` maps Meta's Legal Agent Workshop patterns to GrinFlow and documents model-access/billing cautions.
- `AGENTIC_ARCHITECTURE.md` defines the extraction → validation → deterministic matching → human decision pipeline and the current MVP boundary.
- `BUDGET_GUARDRAILS.md` gives a conservative order for using the US$150 credits.
- `ONBOARDING_GUIDE_ES.md` explains the product, user, architecture, boundaries, setup and contribution process in Spanish.
- `PLAN_DE_TRABAJO_ES.md` defines the remaining plan, founder actions, roles, risks and acceptance criteria through submission.
- `CONTRIBUTOR_TASKS.md` is a prioritized task board for collaborators.

These documents are design/research artifacts. They do not mean the workshop repository was executed or that live Meta inference has been verified.

## v0.7 — logistics platform shell

The new `/platform` route expands the intake prototype into a local-first operations console with:
- Operations dashboard and queue
- Supply record creation and human correction/confirmation
- Explicit lifecycle state machine (`draft` → `needs_review` → `ready_to_match` → `proposed` → `approved` → `assigned` → `picked_up` → `delivered`)
- Recipient network and transport capacity directories
- Deterministic blockers before critical state transitions
- Browser-local persistence and manual JSON export
- Local event history with before/after correction snapshots
- Responsive desktop/mobile layouts
- PostgreSQL schema proposal under `db/migrations/0001_initial.sql`
- Production architecture plan under `docs/PRODUCTION_ARCHITECTURE_ES.md`

**Important:** this is a functional prototype shell, not a production logistics service. The platform uses synthetic records and `localStorage`. It has no authentication, shared database, server-side operation API, live route calculation, messaging integration, vehicle reservation, or real dispatch. The SQL migration is a design artifact and has not been applied. The model can interpret text, but human verification and deterministic gates remain required.

Open `/platform` after `npm install` and `npm run dev`.

## v0.8 additions

- `src/lib/match-engine.mjs`: deterministic candidate evaluation and ranking. All hard constraints must pass; the score only ranks eligible candidates. A verified route is required before a candidate can be called operationally eligible.
- `MATCH_ENGINE_SPEC_ES.md`: decision gates, score weights, route contract and limitations.
- `db/migrations/0002_row_level_security.sql`: proposed Supabase RLS baseline. **Review and test before applying; not executed in this package.**
- `RELEASE_NOTES_v0.8.md`: current verification and known gaps.

The match engine remains a standalone module and is not connected to `/platform` or a database yet. No Meta API call is needed to run the tests.

## v0.9 additions: network intelligence and backhaul

The product thesis is documented in `PRODUCT_PHILOSOPHY_ES.md`: GrinFlow should add an intelligence layer to WhatsApp, calls, spreadsheets and existing logistics—not force every partner to replace their workflow. `src/lib/backhaul.mjs` detects possible return-trip opportunities after a confirmed delivery, using explicit consent, verified route deltas, available capacity, food-safety gates and carrier permission. See `BACKHAUL_ENGINE_SPEC_ES.md`.

The backhaul engine is a deterministic prototype with synthetic test cases. It does not call a map provider, contact a driver, or dispatch a vehicle.


## v0.9 additions: API boundary

`docs/API_CONTRACT_ES.md` documents the proposed server-side API, role checks, idempotency, audit and extraction-preview contract. These routes are design contracts, not yet implemented endpoints.


### Demo preview endpoints (v0.9)

- `POST /api/demo/match-preview`: stateless evaluation of at most 20 recipients × 20 transport options; returns blockers and ranked candidates.
- `POST /api/demo/backhaul-preview`: stateless evaluation of one possible return-trip opportunity.

Both endpoints are demo-only, accept at most 20 KB, persist nothing, call no external providers, and cannot contact drivers or dispatch. Do not send personal data. Production APIs still need authentication, tenant isolation, rate limits and reviewed permissions.

## Product architecture references

- `docs/AGENT_FIRST_PRODUCT_BLUEPRINT_v0.1.md`: agent-first thesis, canonical workflow, role-scoped agents, domain model, autonomy tiers and MVP definition.
- `docs/HUMAN_INTERACTION_LAYER_v0.2.md`: human clarification/confirmation/approval patterns, consent rules and demo flow.
- `PRODUCT_PHILOSOPHY_ES.md`: concise product doctrine and four-level evolution.

These documents define the intended architecture; they do not claim the corresponding integrations or production backend already exist.


## v0.10 additions: Human Interaction Layer

`src/lib/interactions.mjs` implements an isolated request lifecycle (`pending → answered | expired | cancelled`) with target actor/role checks, closed response choices, expiry, cancellation reason and event history. A response never changes an offer or operation automatically. See `HUMAN_INTERACTION_ENGINE_SPEC_ES.md`. The module is not yet connected to persistence, notifications or UI.
