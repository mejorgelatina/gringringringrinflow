# Implementation plan — Oct 26 to Nov 4, 2026

## Current state (based on artifacts, not live account/repo inspection)
- Product thesis and architecture: documented.
- v0.2 frontend/API/matcher scaffold: written in this package.
- Deterministic invariant tests: written; run `npm test` to verify locally.
- Live Meta API: not yet verified.
- Existing 30-case golden set: preserved as `tests/golden-set.json`; reproducible API evaluation harness added but not yet run against Meta.
- Persistence, auth, real integrations, deployment and submission: not done/verified.

## Priority sequence
### P0 — prove the core (Oct 26–27)
- [ ] Install and run app locally.
- [ ] Run `npm test` and `npm run build`; fix failures.
- [ ] Obtain/verify Meta API access and make one successful server-side call.
- [ ] Record model ID, latency, error behavior and whether structured output is supported.
- [ ] Make it impossible for UI/demo narration to confuse local fallback with Meta inference.

### P1 — make extraction verifiable (Oct 27–28)
- [ ] Bring in the existing 30-case golden set.
- [ ] Add exact-quote, no-event, approximate quantity, correction, unknown-condition and historical-offer tests.
- [ ] Report per-field accuracy and unsafe false-positive count; don't invent a score before running it.
- [ ] Add targeted clarification question for missing quantity, condition, deadline or location.

### P2 — coordination and state (Oct 28–30)
- [ ] Make candidate blockers fully visible, including all blockers, not only first three.
- [ ] Separate draft → needs clarification → pending confirmation → available → proposal → approved/rejected.
- [ ] Preserve corrections as events and add idempotency key handling.
- [ ] Confirm recipient receiving/storage and transport capacity rather than assuming them in production.

### P3 — demo reliability (Oct 31–Nov 2)
- [ ] Test mobile layout and failure/timeout behavior.
- [ ] Seed deterministic synthetic scenario so demo is repeatable.
- [ ] Add event history and explicit simulated outcome.
- [ ] Feature freeze Nov 2; no untested scope expansion.

### P4 — submission (Nov 3–4)
- [ ] Public repository and clear README.
- [ ] Identify hackathon-built code/features in README and video.
- [ ] Record 3-minute demo; show Meta model actually used if access verified.
- [ ] Verify all links/video permissions and submit before deadline.

## Acceptance criteria
- Every model-extracted claim has a verbatim supporting quote.
- Unknown condition cannot match a people-tier destination.
- Estimated or unknown quantity cannot produce an executable proposal.
- Missing deadline and unconfirmed transport block a candidate.
- Hard constraints override ranking.
- No approval is inferred from silence.
- A decision never claims execution.
- No synthetic operation is described as real impact.


## Meta workshop learning

1. Read `META_WORKSHOP_TO_GRINFLOW.md` and the source workshop handbook before execution.
2. Keep the current one-call extraction path unless a tool loop demonstrably improves the user outcome.
3. Enforce safety, evidence, matching, and approval gates in application code—not only in the model prompt.
4. Test the direct Meta API with one basic inference before JSON mode; then expand to 3–5 golden cases while watching credit usage.
5. Treat multimodal intake as a later bounded feature (e.g. reading labels/documents), never as food-safety certification.
