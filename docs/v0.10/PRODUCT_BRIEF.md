# Product brief — GrinFlow

## One-line pitch
GrinFlow turns fragmented food-surplus messages into verifiable, human-approved rescue proposals by coordinating existing supply, needs and available capacity.

## Core philosophy
Do not replace the network's WhatsApp, calls, spreadsheets, relationships, vehicles or routines by default. Add an intelligence layer that makes the existing ecosystem easier to coordinate.

## Demo vertical slice
1. An informal Spanish message enters the system.
2. The Meta model extracts a typed draft with exact evidence quote, uncertainty and missing fields.
3. Server validates the response schema and confirms the quote exists verbatim in the source message.
4. Deterministic code evaluates synthetic recipients and capacity; hard constraints cannot be overridden by a score.
5. UI explains one feasible proposal or why every candidate is blocked.
6. Human explicitly approves or rejects the proposal.
7. Session audit trail records the decision; outcome remains explicitly simulated.

## User value
Reduce coordination overhead and help operators see which next action is feasible, what information is missing, and why alternatives are blocked—without forcing the network to replace its existing tools.

## Non-goals
Full marketplace, autonomous dispatch, real-world food safety judgement, real WhatsApp/Uber integration, broad multi-agent architecture, or claims of food rescued/emissions avoided without measured evidence.

## Design invariants
- Unknown is not zero and is not safe.
- Estimated quantity is not confirmed quantity.
- Every extracted event needs a source quote.
- Hard gates run before ranking.
- No unconfirmed capacity is executable.
- Silence is not consent.
- Proposal, approval, execution and verified outcome are different states.
- Synthetic data and simulated actions remain labelled.
