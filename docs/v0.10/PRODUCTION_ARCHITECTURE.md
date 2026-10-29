# Proposed Production Architecture

## Target flow
`Authorized channel → ingestion gateway → model extraction → schema/evidence validation → deterministic domain engine → human interaction request → authorized decision → durable event log → optional verified integration`

## Components
- **Ingestion gateway:** authenticated source, request IDs, rate limits, input-size bounds, and secret-safe logs.
- **Extraction adapter:** provider-specific model call, strict timeout, bounded output tokens, no implicit retries, and explicit fallback labelling.
- **Validation layer:** schema validation, source quote checks, confidence/uncertainty handling, and correction workflow.
- **Deterministic domain core:** state machine, compatibility rules, hard blockers, route contract, and idempotency.
- **Human interaction layer:** role-addressed questions, explicit allowed responses, expiry, and auditable actor identity.
- **Persistence:** relational records plus append-only event history and optimistic concurrency/version checks.
- **Integrations:** routing, messaging, and transport providers behind separate adapters with consent and provider-specific failure handling.

## Security requirements
- Tenant isolation enforced server-side and tested at the database layer.
- Least-privilege roles; no public client access to sensitive tables until row-level security is reviewed and tested.
- Secrets in environment/secret management, never in client bundles.
- Data minimization, retention rules, deletion workflows, and access audit.
- No automatic dispatch from model output or a high matching score.

## Migration status
SQL files in this repository are proposed designs. They have not been applied to a production database. Review constraints, indexes, tenant consistency, policies, and migration rollback before use.
