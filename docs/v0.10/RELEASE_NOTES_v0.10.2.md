# GrinFlow v0.10.2 — English edition and review workflow

## Changes
- Translated the primary app UI, seeded operational labels, user-facing rule messages, and primary documentation into English. The intake example and golden set remain in Spanish intentionally because the extraction demo targets informal Spanish messages.
- Added English-first documentation for product philosophy, onboarding, platform scope, build plan, matching, backhaul, human interaction, API contract, Meta validation, and production architecture. Original Spanish documents are preserved under `docs/archive/es/`.
- Kept separate Muse Code builder and read-only verifier prompts, following the workshop advice to have one session write code and another independently review it.
- Kept a handoff checklist that separates unit tests, typecheck, build, browser QA, deployment smoke test, live provider validation, and pilot evidence.
- Meta smoke diagnostic defaults to model listing only (zero inference calls). `--basic` and `--structured` each make one intentional inference call; `--all` explicitly opts into two calls.

## Verification performed for this English edition
- `node --test`: 47/47 tests pass.
- `node --check` passes for the JavaScript module and script files.
- Full Next.js typecheck/build and browser QA have not been run in this environment because installed project dependencies are not available here.
- No live Meta API calls, deployment, or repository merge were performed.

## Documentation
See `README.md` for the English-first documentation index. Original Spanish source documents are preserved under `docs/archive/es/`.

## Boundaries
This remains a local-first prototype. It does not connect to a durable database or real transport providers and does not execute real-world operations.
