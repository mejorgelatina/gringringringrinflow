# resource network (`lib/network/`)

One coordination model for food banks, makers, compost operators and carriers. They are participants with different capabilities, not separate systems. Screen: `/network`. Tests: `tests/network.test.ts`.

## objects

| object | file | what it is |
| --- | --- | --- |
| `Participant` + `Need` | `types.ts` | anyone in the network. A destination has a `need`: tier, categories or materials, accepted conditions, required specs (e.g. limpia, seca), min/max kg, weekly capacity, receiving days and hours, whether it picks up itself |
| `Vehicle` | `types.ts` | logistics capacity, kept apart from destinations. `courier` quotes per trip; `route` offers spare room on a trip it already makes (backhaul) |
| `Resource` | `types.ts` | a lot: item, category, material, kg, condition (+ confirmed), attributes, pickup point and window |
| `ServiceArea` | `types.ts`, `zones.ts` | the pilot region. Zone a ≤ 20 min (direct pickup), zone b ≤ 45 min (quoted delivery or backhaul), zone c not offered |
| `NetworkCase` | `coordinator.ts` | one lot moving through the network; every step appends to an event log |

## engines

| engine | where | rule |
| --- | --- | --- |
| geographic eligibility | `zones.ts` | operational ETA at that hour (road factor × hourly urban speed + handling), not raw km |
| matching | `match.ts` `evaluateDestination` | hard filters first (verified, area, food safety, category or material, condition, specs, minimums, weekly capacity, open that day, zone, at least one viable delivery mode); score only ranks the eligible |
| allocation (cascade) | `match.ts` `allocateTier`, `coordinator.ts` | people → transformation → compost. A tier is offered only when no earlier tier has a viable destination, or earlier tiers were exhausted. Unknown or unconfirmed condition never goes to people |
| notifications | `coordinator.ts` `publish`, `tick` | waves of 3 per tier, widened every 30 min; when a tier runs out, the remainder cascades |
| reservations | `reserve`, `tick` | partial holds; never more than what is left; 90 min or until the window closes; expired holds return kg |
| logistics | `logistics.ts`, `chooseDelivery`, `acceptQuote`, `confirmCapacity` | the receiver chooses: pickup (free, zone a, if it collects), courier (quoted), backhaul (detour ≤ 8 km, cost of the detour). Nothing is confirmed until the receiver accepts the cost and the carrier confirms capacity |
| handoff | `recordPickup`, `stopHandoff` | the collector shows a code. The donor does not approve receivers; they can stop a handoff over an anomaly, which asks for a person |
| outcome + tracking | `confirmReceipt`, `outcomes.ts` | only what the receiver confirms counts. Impact is kept per route (people, transformation, compost) and never summed. Operational metrics: lots with a destination, minutes to first hold, completed deliveries, expired holds, logistics cost, idle capacity used, detour km |

## what is simulated

All participants, places, prices and times in `demo.ts`. Courier and backhaul quotes are computed locally; no courier, WhatsApp or Meta API is called. ETAs are straight-line estimates. A routing or courier API would replace `etaMinutes` and the quote functions without changing the callers.

## not yet connected

The intake agent (`/agent`), WhatsApp handler and `/intake` still use `lib/engines/matching.mjs`. Next step: have the agent's `find_matches` tool call `matchResource` and open a `NetworkCase` on approval.
