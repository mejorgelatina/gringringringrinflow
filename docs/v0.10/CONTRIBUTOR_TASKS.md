# Contributor task board

Use this lightweight board until the team selects a real issue tracker. Each task needs an owner, evidence, and acceptance criteria.

## P0 — release blockers

- [ ] **P0-01: Clean install** — Run `npm install`; capture the result; resolve dependency failures.
- [ ] **P0-02: Typecheck/build** — Run `npm run typecheck` and `npm run build`; fix all blocking errors.
- [ ] **P0-03: Browser walkthrough** — Run `npm run dev`; test a complete, ambiguous, historical, and no-event message.
- [ ] **P0-04: Meta smoke test** — After credit/model access is confirmed, run one basic inference and then JSON mode only if safe; record no secrets.
- [ ] **P0-05: Provider transparency** — Verify that UI always distinguishes Meta inference from local fallback and that model errors are not silently replaced by local output.

## P1 — trust and extraction quality

- [ ] **P1-01: Evidence tests** — Add tests for missing quote, quote not verbatim, and multiple events.
- [ ] **P1-02: Historical offers** — Expand tests beyond the specific phrases currently recognized by the local fallback.
- [ ] **P1-03: Corrections** — Test a correction message without silently erasing the previous claim.
- [ ] **P1-04: Quantity confidence** — Test stated vs estimated quantities, unknown units, and zero quantity.
- [ ] **P1-05: Golden evaluation** — Run 3–5 examples against Meta first; inspect failures before running all 30.

## P2 — explainable demo

- [ ] **P2-01: Full blockers** — Ensure every candidate shows all relevant blockers, not a truncated subset.
- [ ] **P2-02: State labels** — Clearly distinguish draft, needs clarification, proposal, approved/rejected, and simulated outcome.
- [ ] **P2-03: Mobile QA** — Verify small viewport, long messages, loading, and API failure.
- [ ] **P2-04: Demo seed** — Provide a deterministic synthetic scenario with documented expected output.
- [ ] **P2-05: Session trace** — Ensure the UI labels audit history as session-only and simulated.

## P3 — submission

- [ ] **P3-01: Secret scan** — Ensure `.env.local`, API keys and tokens are not committed.
- [ ] **P3-02: Public README** — Include setup, architecture, hackathon-built scope, limitations, and demo link.
- [ ] **P3-03: Deploy** — Verify production environment variables and run a browser walkthrough on the deployed URL.
- [ ] **P3-04: Three-minute video** — Capture the product flow, Meta usage if verified, safety boundary, and result.
- [ ] **P3-05: Submission QA** — Open all URLs from a private browser and submit before deadline.

## Definition of done

- [ ] Acceptance criteria met.
- [ ] Relevant tests added/updated and passing.
- [ ] Test commands and results recorded.
- [ ] No secret or unauthorized real-world data added.
- [ ] Synthetic assumptions and simulated actions remain labelled.
- [ ] Documentation updated if behavior changed.
