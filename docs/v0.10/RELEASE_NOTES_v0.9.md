# GrinFlow v0.9 — network intelligence layer

## Added
- Product philosophy converted into a product doctrine: integrate with existing workflows rather than replace them.
- Backhaul opportunity engine to evaluate a second pickup/delivery after a confirmed drop-off.
- Hard gates for donor consent, transport terms, available capacity, confirmed first delivery, recipient compatibility, human food-condition verification, time windows, verified route and positive net kilometer benefit.
- Ranking function for backhaul opportunities.
- Eight new deterministic tests; no Meta API calls or paid map requests.

## Automated checks
- `npm test`: 34/34 tests passing (26 previous + 8 backhaul).
- Model usage: none.

## Not implemented
- Map provider integration, real route estimates, vehicle/driver API, WhatsApp integration, partner consent UI, backend persistence, auth or dispatch.
- Real-world impact measurement; current examples are synthetic.
