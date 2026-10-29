# GrinFlow — Work Plan and Action List

**Hackathon deadline:** November 4, 2026, 9:00 PM ET / 8:00 PM Mexico City.  
**Goal:** deliver a reliable, explainable, reproducible demo—not build the entire logistics platform before submission.

## Executive summary
The prototype contains a Next.js UI, intake endpoint, Meta adapter, local fallback, deterministic matcher, a 30-message evaluation set, logistics modules, and a review workflow. Package-level tests pass in the current artifact. A successful test run does not by itself verify a clean Next.js build, browser runtime, live Meta inference, deployment, or real-world operations.

The priority is not adding more features. It is reducing technical uncertainty and producing a demo we can defend.

## Verified in this artifact
- [x] Product philosophy and MVP boundary.
- [x] Intake UI and endpoint code.
- [x] Meta adapter and clearly distinguished local fallback.
- [x] Schema validation and exact-source evidence checks.
- [x] Deterministic matching and hard blockers.
- [x] Spanish-language golden set of 30 messages.
- [x] Automated tests for core logic.
- [x] Builder and read-only verifier prompts.
- [x] Spend-conscious Meta diagnostic defaults.

## Still to verify
- [ ] Clean install from a fresh checkout.
- [ ] Full TypeScript check and production build.
- [ ] Browser QA of all intended routes on desktop and mobile.
- [ ] Live Meta inference with one intentional request.
- [ ] Evaluation against all 30 golden cases.
- [ ] Deployment smoke test and actual route availability.
- [ ] End-to-end flow persistence and event audit.

## Priority order
1. Reproduce install, tests, typecheck, and build.
2. Verify Meta billing/credits, then make one small, deliberate inference request.
3. Capture sanitized success/error evidence and confirm actual response structure.
4. Run the golden-set evaluation and inspect safety-critical false positives.
5. Complete a concise demo script and label simulated behavior clearly.
6. Keep the release checklist and independent review as merge gates.

## Release principle
Do not describe a check as passed unless it was actually run. Record skipped checks, errors, and assumptions. Do not enable live model calls in previews by default.
