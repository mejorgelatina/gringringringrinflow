# GrinFlow v0.10.2 — status report

## Added in v0.10.2
- Separate builder and read-only verifier agent prompts following the Meta workshop recommendation.
- Handoff checklist to separate builder claims from independent review evidence.
- Meta smoke diagnostic defaults to model listing only (zero inference calls); `--basic` and `--structured` each make one intentional inference call; `--all` explicitly makes two.
- Smoke requests use short output limits and validate the exact expected result.

## Checks run for this patch
- `npm test`: 47/47 pass.
- `node --check scripts/smoke-meta.mjs`: pass.
- No live Meta inference, install, full Next.js build, browser QA, deployment, database migration, or real-world dispatch was run.

## Existing prototype capabilities
- `/platform` local-first operations console with synthetic data.
- `/api/intake` uses local fallback unless both `MODEL_API_KEY` and `META_CALLS_ENABLED=true` are present.
- Standalone deterministic matching, backhaul, and human-interaction modules with tests.
- Stateless demo endpoints `/api/demo/match-preview` and `/api/demo/backhaul-preview`.

## Critical limits
- This is not a production logistics platform. Demo data is synthetic and no database persistence, auth, tenant isolation, live route provider, WhatsApp integration, transport partner availability, reservation, or dispatch is connected.
- Meta's endpoint/model/request format is based on documentation review, but access for the user's account and JSON Schema acceptance have not been verified with a live call.
- Do not run paid inference without explicit owner approval and a confirmed billing/credit balance.

## Recommended workflow
1. Builder session implements one scoped task and adds tests.
2. Separate verifier session gets read-only access, inspects the diff and reports severity-ranked findings without editing.
3. Builder addresses findings; verifier re-checks the changed areas.
4. Human owner reviews remaining risks and approves deployment or paid inference separately.
