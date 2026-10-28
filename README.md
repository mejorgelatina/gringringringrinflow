# gringringrinflow

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_vt88NaiYf98KwIS3tAIcwlNwFYou)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.

## Coordination loop demo

`lib/grinflow/` holds the first coordination loop as plain TypeScript with no external services:

1. An offer arrives with some fields reported, some missing (`receiveOffer`).
2. Missing data and critical values that need confirmation are identified (`identifyGaps`).
3. Requests go to the donor with allowed answers and an expiry (`requestInformation`, `answerInteraction`). An answer never approves anything; silence leaves data unconfirmed (`expireInteractions`).
4. Destinations and vehicles are evaluated: hard constraints first, then a score with reasons (`proposeDestinations`). A score never overrides a block.
5. Only an operator can approve or reject, and the decision is logged with who, when and which option (`recordDecision`). Approval places a hold; pickup and delivery are recorded separately.

Every step appends to an event log with before/after values for each confirmed field.

- Interactive walkthrough: `/demo/flujo`
- API: `POST /api/demo/offer-flow` (body optional: `answers`, `decision`, `offer`, `destinations`, `vehicles`). Stores nothing and sends nothing.
- Tests: `pnpm test` (Node 22.6+)

```bash
curl -s -X POST localhost:3000/api/demo/offer-flow -d '{"decision":{"outcome":"approved"}}'
curl -s -X POST localhost:3000/api/demo/offer-flow -d '{"answers":{"quantity":"si"}}'   # stops at needs_information
```

All places, distances and availability in the demo are synthetic. Distances are straight-line estimates, not verified routes.
