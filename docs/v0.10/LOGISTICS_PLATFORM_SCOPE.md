# GrinFlow Logistics Platform — Scope v0.10.2

## What this prototype includes
A navigable local console for representing a logistics operation: create a supply offer, review evidence, select a recipient and transport capacity, assess blockers, record lifecycle transitions, and inspect local event history.

## Modules
1. **Overview:** operation counts, attention queue, coordination health, and operating principles.
2. **Operations:** supply record, source evidence, human correction/confirmation, recipient and transport selection, feasibility checks, and lifecycle state machine.
3. **Recipient network:** synthetic directory with categories, capacity, use type, receiving windows, and declared-condition policy.
4. **Transport capacity:** synthetic capacity, availability, driver, and attributes awaiting verification.
5. **Event history:** local record of changes and transitions.
6. **JSON export:** manual export of local state for review and backup.

## Lifecycle model
`draft → needs_review → ready_to_match → proposed → approved → assigned → picked_up → delivered`

Cancellation is allowed before delivery. Invalid transitions are rejected. To become `ready_to_match`, an operation needs a category, positive confirmed quantity, declared condition, human condition confirmation, pickup location, and deadline. To propose, approve, assign, pick up, or deliver, the recipient and vehicle combination must pass deterministic rules.

## Important limitations
- All people, organizations, capacities, and routes are synthetic.
- State is stored in the browser; it is not shared or durable server storage.
- No authentication, authorization, live routing, external messaging, reservation, or dispatch exists.
- The condition field records a declaration; it does not certify food safety.
- The SQL migrations are proposals, not applied production migrations.
- Matching results are demo suggestions, not proof of real-world feasibility.
