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

## impact zones, service areas and coverage (`coverage.ts`)

- **impact zone**: a generator (hotel, supermarket, restaurant, market) declares a discovery radius (`generator.impactRadiusKm`, 5 km in the demo) and its regular streams (item, condition, kg per week, frequency, usual window). Destinations outside it get `outside_impact_zone`.
- **receiver service area**: a receiver can declare `serviceRadiusKm`; origins farther away get `outside_receiver_area`.
- **service area (feasibility)**: unchanged. ETA zones a/b/c, windows, capacity and logistics decide whether a match is viable. The radius discovers; feasibility decides.
- **network coverage**: `coverage(network, day)` runs every regular stream through the same engine and reports the % of generated kg/week with a viable route, kg by tier, and for each gap the closest destination that would take that material and what stops it. `/network` has a radius slider to explore it (5 km → 83%, 7 km → 97% in the demo).
