# Proposed API Contract

This is a design contract for the next implementation stage, not a claim that all endpoints are deployed.

## Design rules
- Validate all request bodies server-side.
- Use explicit request and operation IDs for traceability.
- Keep model extraction separate from deterministic validation and human authorization.
- Return structured errors without secrets, provider tokens, or unnecessary personal data.
- Treat previews as read-only and stateless.
- Use idempotency keys for any future mutating operation.
- Authenticate and authorize every production mutation; never trust a client-supplied tenant ID.

## Demo routes
- `POST /api/intake`: extract candidate facts and return a feasibility preview.
- `POST /api/demo/match-preview`: stateless synthetic matching preview.
- `POST /api/demo/backhaul-preview`: stateless synthetic return-trip preview.

Before production, define versioning, authentication, tenant isolation, rate limits, durable event history, retention, retries, timeout policy, and operational ownership.
