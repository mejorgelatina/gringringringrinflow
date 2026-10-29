# GrinFlow v0.8 — Technical Update

## Added
- Deterministic candidate ranking with hard gates and explainable `grinflow-match-v1` scoring.
- Explicit blocking when a verified route is missing; no distance or ETA is invented.
- Blockers for estimated/unconfirmed quantity, incompatible units, unsafe condition, unconfirmed recipient/transport, capacity, deadline, and operating windows.
- Proposed `0002_row_level_security.sql` migration with baseline tenant/role policies and read-only operation/audit access from the client.
- Stronger extraction prompt that treats source messages as untrusted JSON data, limits input to 10,000 characters, and supports `META_BASE_URL`.

## Verification status at that release
- Core tests passed in the original environment.
- No model calls were made and no Meta credits were consumed.

## Not verified at that release
- Clean dependency install, `next build`, full typecheck, and browser testing.
- Migrations against Supabase/PostgreSQL. RLS policies require security review and tests with two organizations and every role.
- Matching connected to the UI, durable persistence, authentication, or live map routes.

The RLS migration is a reviewable starting point, not a security certification. Before real data is used, test cross-organization references, every role's policies, invitations, consent revocation, concurrent operations, and access through server-side APIs.
