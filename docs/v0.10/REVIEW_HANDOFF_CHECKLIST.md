# GrinFlow builder → verifier handoff

Use two separate Muse Code sessions, as recommended in the Meta workshop. The builder may edit; the verifier is read-only and must not share write permissions.

## Before implementation
- [ ] Write acceptance criteria in observable terms.
- [ ] Name the files/modules expected to change.
- [ ] Name safety and billing invariants that must remain true.
- [ ] Decide whether the task needs any external call. Default: no.

## Builder handoff
- [ ] Small, scoped diff; no unrelated refactor.
- [ ] Regression tests include a valid case and at least one blocked/invalid case.
- [ ] `npm test` outcome captured.
- [ ] Typecheck/build/browser checks separately labelled as passed, failed, or not run.
- [ ] No secrets or real personal data in artifacts.
- [ ] No deployment, merge, or paid model call unless approved.

## Verifier pass (separate session, read-only)
- [ ] Read the acceptance criteria and inspect the diff directly.
- [ ] Independently trace safety and authorization boundaries.
- [ ] Check tests and look for missing negative cases.
- [ ] Verify every claim in the builder summary against code/output.
- [ ] Produce severity-ranked findings; do not edit files.

## Closeout
- [ ] Builder addresses findings in a new diff.
- [ ] Verifier re-checks only the changed areas plus regressions.
- [ ] Human owner accepts remaining risks.
- [ ] Record exact commit/PR and environment for release checks.

## Never conflate these signals
Unit tests ≠ full TypeScript check ≠ production build ≠ browser QA ≠ deployed-site smoke test ≠ live Meta API validation ≠ real logistics pilot.
