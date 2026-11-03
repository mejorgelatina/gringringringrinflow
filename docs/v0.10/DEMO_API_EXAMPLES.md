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
  -d '{"offer":{"id":"demo-offer-1","category":"panificados","quantity":20,"unit":"caja","quantityConfirmed":true,"condition":"edible","conditionConfirmed":true,"pickupLocation":"Roma","deadline":"2026-10-29T18:00:00-06:00"},"recipients":[{"id":"rec-1","name":"Comedor","categories":["panificados"],"conditionPolicy":["edible"],"confirmed":true,"capacity":100}],"transports":[{"id":"t-1","name":"Camioneta","confirmed":true,"capacity":500,"unit":"kg"}]}'
```

The offer needs a Spanish category plus `unit`; at least one recipient and one transport are required (key `transports`, not `vehicles`). Empty arrays return `invalid_request`.

## 3. Backhaul preview

Send a synthetic completed trip, vehicle capacity, consent, offer, recipient, and verified-route fields to `POST /api/demo/backhaul-preview`. The response explains which hard gates pass or block the opportunity. Do not substitute guessed distances for a verified route.

```bash
curl -s http://localhost:3000/api/demo/backhaul-preview \
  -H 'content-type: application/json' \
  -d '{"trip":{"vehicleConfirmed":true,"originalDeliveryConfirmed":true,"capacity":500,"loadAfterDropoff":0,"availableUntil":"2026-11-03T20:00:00-06:00","transportPermissionConfirmed":true},"offer":{"category":"organico","quantity":100,"quantityConfirmed":true,"condition":"inedible","conditionConfirmed":true,"deadline":"2026-11-03T18:00:00-06:00","donorConfirmed":true,"shareConsent":true},"recipient":{"categories":["organico"],"conditionPolicy":["inedible"],"confirmed":true},"route":{"verified":true,"incrementalKm":5,"emptyKmAvoided":10}}'
```

## 4. Safety notes
- A preview never books a vehicle or contacts a participant.
- Route values in fixtures are synthetic.
- Do not send personal or production data to the demo endpoint.
- Server-side persistence and authorization are not implemented in this prototype.
