# gringringrinflow

GrinFlow coordinates surplus food between donors, receivers and vehicles that are already moving. Meta's Muse Spark reads informal messages and photos; deterministic rules and a human operator decide. Track: Meta Global AI Developer Hackathon, "Build for Your World".

## for judges: the short version

**The problem.** Food that is still good gets thrown away while people go hungry, and organic waste that could be transformed rots in landfills and produces gases. Three things stop the connection: shelf life (value drops by the hour), geography (surplus is never where the need is) and coordination (nobody knows who has what, who can take it, or whether it arrived).

**What GrinFlow does.** A donor writes or sends a photo, on WhatsApp or on the web. Muse Spark turns the messy message into structured data. Deterministic rules decide what is eligible (safety gates, time window, travel-time zones). A person verifies organizations and signs every decision. The lot follows a cascade: food for people first, then material transformation by a maker (for example eggshell to biomaterials), then compost. Every case gets a tracking code, a handoff code and verified receipt.

**Where Meta's models run.** Everything at runtime uses the Meta Model API (default model `muse-spark-1.3`; no other model provider is called). All calls are off unless `MODEL_API_KEY` is set and `META_CALLS_ENABLED=true`, otherwise a labeled local fallback runs, so previews never spend credits.

| Use | Code | What the model does |
| --- | --- | --- |
| Message intake | `lib/meta/meta.ts`, `lib/intake/` | reads an informal message and returns structured offer or need fields (item, amount, condition, deadline, location) |
| Photo vision | `lib/meta/photo.ts`, `lib/meta/photo-policy.ts` | describes what is visible and grades the photo; fixed rules then limit what the photo can imply (it never certifies food safety) |
| Intake agent planner and claims judge | `lib/agent/planner.ts`, `lib/agent/judge.ts` | plans which tool to call next (Responses API) and checks the claims the agent makes before a human signs |

Every screen that runs a turn shows which provider ran (local or Meta), the model id and how many Meta calls it cost: see the trace on `/whatsapp`, `/intake` and `/agent`. The demo video shows live calls during the Meta credit window.

**Two ways in, same brain.** WhatsApp (Cloud API test number, `/api/whatsapp/webhook`) and the web chat at `/send` both run the same handler, so the conversation, registration and offers behave the same. If you cannot message the test number, use `/send`, or `/whatsapp` (a simulator with step-by-step traces).

**Try it in 2 minutes (no setup):** open the production site, go to `/send`, press "registrar mi organización" and answer the questions, then send `Tenemos 20 cajas de pan fresco en la colonia Roma, hay que recogerlas antes de las 6 pm.` The team view `/team` needs a team account (the video shows it).

**Run it locally.** Node 22+ and pnpm:

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local   # optional: all Meta, WhatsApp and Firebase variables are off by default
pnpm dev                     # http://localhost:3000
pnpm test && pnpm typecheck  # full suite and types
```

Without any variables, everything runs in labeled local mode with in-memory storage. Real Meta calls need `MODEL_API_KEY` plus `META_CALLS_ENABLED=true`; durable storage needs the `FIREBASE_*` variables; WhatsApp needs the variables in [`docs/WHATSAPP_SETUP.md`](docs/WHATSAPP_SETUP.md).

**Honest limits.** Places, distances and courier quotes in the demos are synthetic or simulated. Distances are straight-line estimates. Delivery partners such as Uber Direct are roadmap, not integrated. Organizations sign in with email and password and see only their own data, but a person on the team still verifies each organization before it joins the network. Browser-level checks (camera QR scan, map tiles, installing the app, offline mode) are not covered by automated tests (they need a real browser). The photo never certifies safety, and a person always signs.

## What was built during the hackathon (Oct 26 – Nov 4, 2026)

Everything below was built during the event. The git history shows it: every commit from 2026-10-28 onward.

| Feature | Where | PR |
| --- | --- | --- |
| Offer → missing data → confirmation → route review → logged human decision | `/demo/flow`, `lib/grinflow/` | #2 |
| v0.10.x engines (matching, logistics, backhaul, interactions), Meta adapter with credit guard, operations console | `lib/engines/`, `lib/meta/`, `/platform` | #2, #3 |
| Message + photo intake with Muse Spark, photo safety policy, human review step | `/intake`, `lib/intake/`, `lib/meta/photo*.ts` | #4 |
| WhatsApp Cloud API webhook, simulator and traces | `/whatsapp`, `/api/whatsapp/*`, `lib/whatsapp/` | #5 |
| Design system (tokens, lowercase rule, logo), new landing hero, web chat on the same handler, grinflow QR, declared demand in intake | `app/tokens.css`, `docs/design-system.md`, `/send`, `/qr`, `/api/message` | #7 |
| Return-trip (backhaul) preview | `/backhaul`, `lib/backhaul/` | #6 |
| Muse Spark intake agent (tool loop, checks it can't skip, operator sign-off) and parcel-style tracking | `/agent`, `/track`, `lib/agent/` | #8 |
| Three routes for a lot: food for people, material transformation by a maker (demo: eggshell → biomaterials, for supermarket returns and merma), compost / responsible disposal. The cascade is a code rule in the agent | `lib/engines/matching.mjs`, `lib/agent/checks.ts`, `/agent` ("supermarket returns") | #10 |
| One resource network: participants (orgs, makers, compost, carriers) in one registry, operational zones by ETA, eligibility before ranking, the people → transformation → compost cascade, notification waves, partial holds that expire, receiver-chosen delivery (free pickup, quoted courier, backhaul; simulated quotes), handoff codes, verified receipt and impact by route. Three end-to-end demo scenarios | `/network`, `lib/network/`, `docs/NETWORK.md` | #11 |
| ICC (índice de calidad compuesto): every channel characterizes a lot the same way before the network sees it. Product, quality, risk and physical dimensions; each value marked declarado, estimado, medido or verificado with evidence, method, model and confidence. A count is never read as kilos; a photo gives an estimated count and volume, never a weight or food safety. Eligibility per destination; composite weights left unset on purpose. The agent asks only for what is missing and is refused in code if it states a weight it does not have | `lib/icc/`, `docs/ICC.md`, ICC card on `/agent` `/intake` `/whatsapp` `/network` | #12 |
| Onboarding over WhatsApp: an organization registers itself in one short conversation (what it does, name, address or location pin, hours, contact, what it accepts or generates, picks up or sends its own courier, WhatsApp opt-in). A person verifies it in `/team` before it enters the network. Conversation memory (an answer completes the last offer), location pins, registered donors don't repeat their address, one team inbox of real offers and needs. Coordinated carriers hidden until validated: receivers pick up or send their own uber | `lib/registry/`, `/team`, `/api/registry`, `docs/ONBOARDING.md` | #13 |
| Optional Firestore persistence: WhatsApp messages and durable webhook dedupe (first draft written with Manus, an outside AI agent, then reviewed here), tracking numbers | `lib/firebase/`, `lib/agent/registry.ts` | #9 |
| Firebase Auth (email/password) for the team in `/team`: verified email + team list checked on the server, deny-all Firestore rules, `firebase.json` for the `grinflow` project | `lib/firebase/`, `lib/auth/team.ts`, `firestore.rules`, `docs/FIREBASE.md` | #14 |
| Web parity: everything the channel does also works from `/send` (including sharing a location pin), makers visible on the landing, organization-type wording and filters in `/network`, accented place names fixed in replies, a Firebase-token verifier that runs on Vercel, per-IP rate limits on the public endpoints | `lib/channel/`, `lib/registry/display.ts`, `lib/network/filter.ts`, `lib/firebase/verify.ts`, `lib/whatsapp/rate-limit.ts` | #5, #7, #9, #10, #11 (this repo) |
| Organization product, built in eight epics from `docs/PRD.md`: organization accounts with data isolation (E1), home per role (E2), publish an offer with photo and eligibility (E3), receive and respond with partial holds, delivery choice and donor stop (E4), missions closed by QR scan with verified receipt (E5), map with own pins and zone-only destinations (E6), verified impact per route, CO2 and water only on food that reached people (E7), installable PWA with offline fallback (E8). 322 tests including five end-to-end journeys | `lib/offers/`, `lib/auth/org.ts`, `lib/impact/`, `lib/map/`, `/cuenta`, `/mi`, `/publicar`, `/recibir`, `/scan`, `/mapa`, `public/sw.js`, `tests/e2e-flow.test.ts` | #15 to #26 |
| WhatsApp replies from the live deployment: recipient numbers normalized for Mexico (inbound `521…` is sent as `52…`), one log line per turn with the outcome and Meta error code, privacy page for the Meta app | `lib/whatsapp/graph.ts`, `/privacidad` | #14, #21, #22 |
| English demo video script and judge-facing README | `docs/DEMO_VIDEO_SCRIPT.md`, `README.md` | this PR |

The v0.10.x engines and documents were written by the team in a separate workspace during the event and imported in PRs #2 and #3. Some planning notes in `docs/v0.10/` are dated Oct 24–25: they are pre-event preparation (ideas and plans, no code).

**Repository history:** this repository was created on 2026-11-02 and carries the complete, unedited git history of the original working repo `mejorgelatina/gringringrinflow`. No commit was removed, reordered or re-dated. All hackathon work starts with PR #2 on 2026-10-28.

**Reused, not wasted:** nothing here was wasted. GrinFlow began on 2026-07-27 as a small v0 landing page (commits `63bd063`…`86ad7b6`, the only commits before the event). For this hackathon we reused it, kept the bones (the sections of `/` are that July base with copy edits; hero, header and styling were rewritten in PR #7) and rebuilt everything else: the agents, the WhatsApp flow, the maps, the missions. Same spirit as the food we rescue: what exists is worth another life.

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
| `/` | Landing page (July base, new hero and design system from PR #7) |
| `/send` | Web chat for donors without WhatsApp; same handler as the webhook via `POST /api/message` |
| `/qr` | Printable grinflow QR that opens the WhatsApp chat |
| `/demo/flow` | Offer → missing data → confirmation → proposals → route review → human decision (`/demo/flujo` redirects here) |
| `/intake` | Message and photo intake, photo safety check, human review, matching and decision |
| `/whatsapp` | WhatsApp simulator running the live webhook handler, with step traces |
| `/network` | One network, three destinations: bread → community kitchen, eggshell → maker, mixed organic → compost, step by step with WhatsApp messages, tracking and verified impact (synthetic) |
| `/team` | Team view: verify organizations that registered over WhatsApp, and see offers and needs as they arrive (contact data needs `OPERATOR_KEY`) |
| `/backhaul` | Return-trip opportunities for a van that just delivered (synthetic). Hidden (404) unless `NEXT_PUBLIC_GRINFLOW_CARRIERS=on` |
| `/platform` | v0.10 logistics console (browser-local synthetic data) |
| `POST /api/demo/offer-flow` | The full loop in memory. Body optional: `answers`, `reviewRouteIndex`, `decision`, `offer`, `destinations`, `vehicles` |
| `POST /api/demo/match-preview`, `POST /api/demo/backhaul-preview` | v0.10 stateless previews ([examples](docs/v0.10/DEMO_API_EXAMPLES.md)) |
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

### judge walkthrough: whatsapp

The live demo uses Meta's free WhatsApp Cloud API test number, not a judge's personal number as the business number. In Meta's developer dashboard, open the app's **WhatsApp → API setup**, copy the test number's **phone number id**, add one judge or teammate as a verified recipient, and subscribe the app to the `messages` webhook field. In the production deployment, set the server-only WhatsApp variables from [`docs/WHATSAPP_SETUP.md`](docs/WHATSAPP_SETUP.md), then use this callback URL:

```text
https://<production-domain>/api/whatsapp/webhook
```

Keep `META_CALLS_ENABLED=false` for the no-credit walkthrough. The local fallback still extracts the offer, applies the deterministic safety and matching rules, and labels the result as local. Set `WHATSAPP_REPLIES_ENABLED=true` only when the judge is ready to receive the bot's reply from the test number; this flag does not turn on Meta model calls.

Send these messages from the verified recipient to the Meta test number:

1. `quiero registrar mi organización`
2. Answer the short onboarding questions with a name, a CDMX colonia, receiving hours, contact and what the organization can receive. A location pin may be sent instead of typing the colonia.
3. Start a separate offer with: `Tenemos 20 cajas de pan fresco en la colonia Roma, hay que recogerlas antes de las 6 pm.`
4. Optionally attach a photo with a caption. A photo can describe what is visible, but it never certifies that food is safe for people.

Open `/team` with a verified team account. The registration appears under **por verificar** and the offer appears in the inbox. Verify the organization only after checking its details. For an offer, choose **proponer destino**; the agent opens with the WhatsApp text already loaded, uses the local fallback, applies the hard gates and stops for a human decision. After approval, the demo prepares a WhatsApp reply containing `/track/GF-…`; the public tracking page shows the stages and clearly labels pickup and delivery as simulated.

If a live Meta test number is not available, open `/whatsapp` and use the same messages in the simulator. The simulator exercises the exact webhook handler without sending a WhatsApp message, and `/team` still shows the resulting synthetic registration or offer.

### Checks

```bash
pnpm install --frozen-lockfile
pnpm test        # node --test, full suite (Node 22.6+)
pnpm typecheck
pnpm build
curl -s -X POST localhost:3000/api/demo/offer-flow -d '{"decision":{"outcome":"approved"}}'
```

All places, distances and availability in the demos are synthetic. Distances are straight-line estimates, not verified routes. v0.10.2 documentation is in [`docs/v0.10/`](docs/v0.10/) (Spanish originals in `docs/v0.10/archive/es/`), proposed migrations in `db/migrations/` (not applied anywhere).

### Golden-set baseline (local fallback, no Meta calls)

`pnpm build && pnpm start`, then `GRINFLOW_BASE_URL=http://localhost:3000 pnpm evaluate`. On 2026-10-29 the rule-based local fallback scored **104/156 field checks (66.7%)** and **5/30 exact cases**, with **0 unsafe edible false positives**. Most misses are `needsReview` (17) and `kind` (13). On 2026-11-02 (branch `muse/m1-baseline`) the same harness scored **110/156 (70.5%)** and **6/30 exact cases**, provider local-only. This is the bar a Meta-backed run should beat; tuning the fallback to the golden set would only overfit it.
