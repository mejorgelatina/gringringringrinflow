# Human Interaction Layer — Request Engine v1

## Goal
Turn a coordination need into a question addressed to an authorized person or role, with explicit response options, expiry, and an audit trail. The module records responses; it does not independently change an offer's state or authorize an operation.

## Lifecycle
`pending → answered | expired | cancelled`

## Minimum fields
- Affected entity and reason code.
- Target person/role.
- Specific question.
- Closed set of allowed answers.
- Channel, creation time, and expiry time.
- Response, actor, role, timestamp, and optional evidence.
- Events for creation, response, expiry, or cancellation.

## Rules
- Silence never means consent, acceptance, or approval.
- Only the designated recipient may respond when one is specified, and the required role must match.
- Responses outside the allowed options are rejected.
- Expired requests cannot be answered retroactively.
- A response is evidence for a human decision, not an automatic dispatch instruction.

## Current boundary
The module is an in-process prototype. Durable persistence, authenticated identities, outbound notifications, and production authorization checks are not connected.
