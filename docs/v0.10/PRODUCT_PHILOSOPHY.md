# GrinFlow — Product Philosophy

## Thesis
**The infrastructure already exists. We're building the intelligence layer on top.**

The operating system of a food-recovery network is not a single app. It is a mix of WhatsApp, phone calls, spreadsheets, personal relationships, coordinators' tacit knowledge, and drivers making decisions on the move. It is imperfect, but it has adoption and gets real work done. GrinFlow should increase its capacity without forcing everyone to abandon their existing tools overnight.

## What we are building
GrinFlow is a logistics intelligence layer connecting **supply, demand, receiving capacity, and underused transport capacity** across an existing network. It is not primarily a new ERP, a proprietary fleet, or another chat app that demands new habits.

## Product evolution

### 1. Communication → structured information
- Accept messages from authorized channels and manual sources.
- Extract supply, quantity, unit, declared condition, pickup location, time window, and verbatim evidence.
- Preserve the original message and distinguish explicit facts, estimates, and inferences.
- Do not create operational events from acknowledgments, historical messages, or noise.

### 2. Coordination → concrete options
- Match offers to demand, receiving capacity, and time windows.
- Identify missing information and ask an authorized person to clarify it.
- Explain why an option is feasible or blocked.
- Keep a person responsible for approval.

### 3. Logistics → use capacity that already exists
- Represent available capacity as something to verify, not assume.
- Evaluate pickup, receiving, handling, timing, and route constraints.
- Treat return trips and idle capacity as potential opportunities, not automatic dispatches.

### 4. Network intelligence → improve the whole system
- Detect recurring bottlenecks and unused capacity.
- Measure outcomes only when supported by evidence.
- Optimize coordination without claiming that a proposed match is a completed delivery.

## Non-negotiable principles
1. **Human authorization:** the system proposes; an authorized person decides.
2. **Evidence first:** retain source text and distinguish stated, estimated, and verified values.
3. **Hard constraints before scores:** a ranking score cannot override safety, consent, capacity, or route blockers.
4. **No implied consent:** silence is not approval.
5. **Privacy and least privilege:** only share data needed for a specific coordination action.
6. **Honest impact:** do not claim food rescued, emissions avoided, or beneficiaries served without verified records.
7. **Incremental adoption:** add intelligence to current workflows before asking partners to change them.

## MVP boundary
The current hackathon prototype uses synthetic records, local browser state, deterministic rules, and an optional Meta extraction adapter. It does not contact donors, recipients, drivers, or messaging services; it does not book vehicles or dispatch deliveries. A feasible demo result is a proposal based on assumptions, not proof of real-world feasibility.
