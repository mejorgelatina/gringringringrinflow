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

## GrinFlow v0.10 + coordination loop

This repo now carries the v0.10.2 package (English edition) (engines, console, demo APIs, docs, migrations) next to the landing page.

| Route | What it is |
| --- | --- |
| `/` | Landing page (unchanged) |
| `/demo/flow` | Offer → missing data → confirmation → proposals → route review → human decision (`/demo/flujo` redirects here) |
| `/intake` | v0.10 message intake and extraction (local fallback; see Meta below) |
| `/platform` | v0.10 logistics console (browser-local synthetic data) |
| `POST /api/demo/offer-flow` | The full loop in memory. Body optional: `answers`, `reviewRouteIndex`, `decision`, `offer`, `destinations`, `vehicles` |
| `POST /api/demo/match-preview`, `POST /api/demo/backhaul-preview` | v0.10 stateless previews ([examples](docs/v0.10/DEMO_API_EXAMPLES_ES.md)) |
| `POST /api/intake` | v0.10 extraction endpoint |

The landing and the v0.10 screens use separate root layouts (`app/(site)`, `app/(ops)`) so their global styles never mix.

### How the loop uses the v0.10 engines

- `lib/engines/` holds the v0.10 engines unchanged except for JSDoc type hints: `interactions.mjs`, `match-engine.mjs`, `backhaul.mjs`, `logistics.mjs`, `matching.mjs`.
- `lib/grinflow/` is the flow on top of them. Requests to the donor are created and answered through the Human Interaction Layer (`interactions.mjs`): an answer only updates the data it was about and never approves anything; silence leaves data unconfirmed.
- Candidates are evaluated by `match-engine.mjs`: hard gates first, score only for eligible candidates. The flow adds pickup/delivery window checks the engine does not do.
- The engine never accepts an unverified route. In the demo an operator reviews the straight-line estimate (`reviewRoute`), which is logged; a route provider can replace that step later.
- Only an operator can approve or reject; approval places a hold, not a pickup. Every step appends to a sequential event log with before/after values.

### Meta credits

`/api/intake` only calls the Meta Model API when `MODEL_API_KEY` is set **and** `META_CALLS_ENABLED=true`. Without both, it uses the local fallback, so preview deployments never spend credits by accident. See `.env.example`.

**Turning on real mode (production only):** in Vercel → Project → Settings → Environment Variables, add `MODEL_API_KEY` (Production scope only) and `META_CALLS_ENABLED=true`, then redeploy. Leave Preview without the flag so branch deploys stay free. Before that, `MODEL_API_KEY=… pnpm smoke:meta` lists models with zero inference calls, and `--basic` makes exactly one. Each `/intake` submission costs one call, plus one more when a photo is attached.

### Photo assessment

`/intake` accepts an optional photo (downscaled in the browser to ≤1024px JPEG). With real mode on, a Muse Spark vision call describes visible items, approximate counts, legible label text and visible issues, and grades the photo. `lib/meta/photo-policy.ts` then applies fixed rules: a clean-looking photo never makes food `edible`; minor issues suggest `past_prime`, severe ones (mold, rot, pests, leaks) suggest `inedible`; and a photo that contradicts an "edible" message makes condition unverified, which blocks people-tier routes until a person confirms. Without real mode the photo is accepted but not analyzed.

### WhatsApp channel

Donors can message a WhatsApp Cloud API test number; `/api/whatsapp/webhook` verifies Meta's signature, runs the same intake pipeline, and replies with one question in the donor's language. `/whatsapp` is a simulator that uses the exact same handler and shows a step-by-step trace, so the flow can be checked without messaging anyone. Replies are only sent with `WHATSAPP_REPLIES_ENABLED=true`. To run it with your own test number, follow [`docs/WHATSAPP_SETUP.md`](docs/WHATSAPP_SETUP.md).

### Checks

```bash
pnpm install --frozen-lockfile
pnpm test        # node --test: 16 flow tests, 17 photo/intake tests, 10 WhatsApp tests, 47 v0.10.2 tests (Node 22.6+)
pnpm typecheck
pnpm build
curl -s -X POST localhost:3000/api/demo/offer-flow -d '{"decision":{"outcome":"approved"}}'
```

All places, distances and availability in the demos are synthetic. Distances are straight-line estimates, not verified routes. v0.10.2 documentation is in [`docs/v0.10/`](docs/v0.10/) (Spanish originals in `docs/v0.10/archive/es/`), proposed migrations in `db/migrations/` (not applied anywhere).

### Golden-set baseline (local fallback, no Meta calls)

`pnpm build && pnpm start`, then `GRINFLOW_BASE_URL=http://localhost:3000 pnpm evaluate`. On 2026-10-29 the rule-based local fallback scored **104/156 field checks (66.7%)** and **5/30 exact cases**, with **0 unsafe edible false positives**. Most misses are `needsReview` (17) and `kind` (13). This is the bar a Meta-backed run should beat; tuning the fallback to the golden set would only overfit it.
