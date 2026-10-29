# Testing GrinFlow Demo Preview APIs

These endpoints are stateless demos. They do not persist data, call map providers, contact drivers, or dispatch operations. Use synthetic data only.

## 1. Start the app

```bash
npm install
npm test
npm run dev
```

## 2. Matching preview

In another terminal, send a synthetic offer and candidate records to `POST /api/demo/match-preview`. The endpoint returns feasibility, score, and blockers; a score cannot override hard constraints.

```bash
curl -s http://localhost:3000/api/demo/match-preview \
  -H 'content-type: application/json' \
  -d '{"offer":{"id":"demo-offer-1","category":"bakery_goods","quantity":20,"quantityConfirmed":true,"condition":"edible","conditionConfirmed":true,"pickupLocation":"Roma","deadline":"2026-10-29T18:00:00-06:00"},"recipients":[],"vehicles":[]}'
```

Empty candidate arrays are useful for verifying request validation, not for demonstrating a match. Use the example fixtures in the repository for a populated preview.

## 3. Backhaul preview

Send a synthetic completed trip, vehicle capacity, consent, offer, recipient, and verified-route fields to `POST /api/demo/backhaul-preview`. The response explains which hard gates pass or block the opportunity. Do not substitute guessed distances for a verified route.

## 4. Safety notes
- A preview never books a vehicle or contacts a participant.
- Route values in fixtures are synthetic.
- Do not send personal or production data to the demo endpoint.
- Server-side persistence and authorization are not implemented in this prototype.
