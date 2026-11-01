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
8. **One-handed operational flow:** the operation adapts to the operator's hands, not the operator to the interface (below).
9. **Estimates are never facts:** a photo or a unit reference can give an estimated count, weight or volume. It stays labelled *estimado* until someone declares, measures or verifies it. A photo never shows temperature, storage history or food safety.

## One-handed operational flow
An operator should not have to learn grinflow to register a surplus. They do what they already do: take a photo, say a sentence, keep working. The flow works with one hand, on the move, with background noise, and without forms.

1. **Capture:** one photo or one voice note (or one WhatsApp message).
2. **Interpret:** the system identifies products, apparent quantities, context and the data it already has.
3. **Evaluate:** ICC builds a preliminary characterization with evidence and confidence (`lib/icc/`, `docs/ICC.md`).
4. **Resolve:** the system asks only what it cannot determine, one question at a time.
5. **Register:** the structured record enters the network; the engine evaluates it.

Less friction does not mean less rigor. The system keeps apart what was observed, declared, estimated and verified, and produces a preliminary evaluation that says what is missing rather than inventing certainty to feel fast.

> The best operational software is the software that never interrupts the operation.

Use it to judge every screen, interaction and new feature.

### Intake metrics
The under-10-second goal is for **capture and first structuring**, not for completing every verification. Computed by `intakeMetrics` in `lib/icc/metrics.ts`.

| metric | what it measures |
| --- | --- |
| Time to Capture | time to take the photo or record the audio |
| Time to Structured Resource | time until the structured ICC record exists |
| Time to Actionable Resource | time until there is enough to evaluate an action (no blocking gap left) |
| Human Correction Rate | share of records a person had to correct |
| Completion Without Typing | records completed without typing (photo, voice, taps) |

## ICC and the agent
- **ICC (índice de calidad compuesto)** is the standard characterization of a lot: product, quality, risk and physical dimensions, each value with its provenance, evidence, method, model version, confidence and validator. It is a core capability, not a chat feature.
- **The agent** is the conversational operator of the network: it understands, characterizes through ICC, completes what is missing by asking, consults the network engine, and presents options and collects authorizations. It does not decide assignments, it does not compute ICC arbitrarily, and it never invents a weight so that a vehicle can be found.
- **The network engine** validates quantities, compatibility, capacity, zones, times, reservations and the three-destination cascade. **The orchestrator** owns states, permissions and approvals.

> grinflow turns organic waste into standardized, traceable and actionable resource intelligence.

## MVP boundary
The current hackathon prototype uses synthetic records, local browser state, deterministic rules, and an optional Meta extraction adapter. It does not contact donors, recipients, drivers, or messaging services; it does not book vehicles or dispatch deliveries. A feasible demo result is a proposal based on assumptions, not proof of real-world feasibility.
