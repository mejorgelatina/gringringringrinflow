# GrinFlow — Meta Hackathon Prototype v0.10.2

**Product thesis:** The infrastructure already exists. We are building the intelligence layer on top.

**Status:** hackathon prototype. Core deterministic tests pass in this artifact; a clean Next.js install/build, browser runtime, live Meta inference, and deployment must be verified in the target repository/environment.

## What is included
- Next.js App Router intake demo at `/`. The example input is informal Spanish because the demo illustrates Spanish-message extraction; the interface is in English.
- Local-first logistics console at `/platform`.
- `POST /api/intake` for extraction and a feasibility preview.
- `POST /api/demo/match-preview` and `POST /api/demo/backhaul-preview` for stateless synthetic previews.
- Meta API adapter configured for `https://api.meta.ai/v1` and `muse-spark-1.3` by default, subject to validation against the account and current official docs.
- Clearly labelled local fallback when Meta is not called. Local fallback output must never be represented as a Meta response.
- Deterministic matching, backhaul, human-interaction modules, and automated tests.
- Builder/verifier prompts and a release handoff checklist based on the workshop advice to separate coding from read-only review.
- Spend-conscious Meta diagnostics: model listing by default, zero inference calls; `--basic` or `--structured` makes one intentional inference call; `--all` makes two.

## Run locally
Requires Node.js 20+ and npm.

```bash
npm install
cp .env.example .env.local
npm test
npm run dev
```

Open `http://localhost:3000`. Meta calls require both `MODEL_API_KEY` and `META_CALLS_ENABLED=true`. Keep the flag `false` for previews. Review `META_BILLING_AND_ACCESS.md` before any live inference request.

```bash
npm run typecheck
npm run build
npm run smoke:meta
```

`npm run smoke:meta` lists models only and makes zero inference calls. `--basic` and `--structured` each make exactly one inference call; `--all` explicitly opts into two calls. Model listing does not prove inference access. Confirm credits and billing before making a request.

## Golden-set evaluation
The 30-case Spanish golden set is at `tests/golden-set.json`. Start the app and run `npm run evaluate` (or set `GRINFLOW_BASE_URL`) to create `golden-eval-report.json`. This is an exact-field harness, not a calibrated benchmark. Review safety-critical false positives individually. It has not been verified against a live Meta model in this package.

## Architecture
`Browser UI → POST /api/intake → Meta adapter or explicitly labelled local fallback → schema and source-evidence validation → deterministic matching → proposal and blockers → human decision → local session audit trail`

The model extracts. Deterministic logic validates. A person decides. The UI does not execute real-world operations.

## Important boundaries
- No durable database or server-side operation persistence; console state is stored in the browser.
- No authentication/authorization, tenant isolation, live WhatsApp, Uber, donor, recipient, or transport integrations.
- No real reservation, dispatch, pickup, delivery, or impact measurement.
- No food-safety certification. Declared condition is not verification; unknown condition is blocked for human-consumption destinations.
- Feasibility is a demo proposal based on synthetic assumptions, not proof of real-world feasibility.
- SQL migrations are design artifacts and have not been applied to production.
- A live Meta model call and structured-output compatibility have not been confirmed by this package.

## Documentation
- `PRODUCT_PHILOSOPHY.md` — product thesis and non-negotiable principles.
- `ONBOARDING_GUIDE.md` — architecture, routes, setup, boundaries, and contributor workflow.
- `PLATFORM_BUILD_PLAN.md` — staged path from prototype to supervised pilot.
- `LOGISTICS_PLATFORM_SCOPE.md` — current console scope and lifecycle.
- `MATCH_ENGINE_SPEC.md` — deterministic matching gates.
- `BACKHAUL_ENGINE_SPEC.md` — return-trip opportunity rules.
- `HUMAN_INTERACTION_ENGINE_SPEC.md` — authorized questions and response lifecycle.
- `docs/API_CONTRACT.md` and `docs/PRODUCTION_ARCHITECTURE.md` — proposed contracts and architecture.
- `docs/META_API_VALIDATION.md`, `META_BILLING_AND_ACCESS.md`, and `META_OFFICE_HOURS_QUESTIONS.md` — Meta validation and spend controls.
- `BUILDER_AGENT_PROMPT.md`, `VERIFIER_AGENT_PROMPT.md`, and `REVIEW_HANDOFF_CHECKLIST.md` — independent review process.
- `WORK_PLAN.md` — submission priorities and remaining checks.
- `docs/archive/es/` — preserved original Spanish documents.

## Release notes v0.10.2
The package adds the builder/verifier workflow, a spend-safe Meta smoke diagnostic, explicit opt-in inference modes, and a review checklist. It does not claim that live Meta inference, deployment, or production integrations have been verified.
