# grinflow product requirements (PRD)

Status: working document for the build before the Nov 4 submission. Read `AGENTS.md` first for how to work in this repo.
Existing behavior is described in `README.md`, `docs/NETWORK.md`, `docs/ICC.md`, `docs/ONBOARDING.md`, `docs/INTAKE_AGENT.md`. This PRD says what to add and what "done" means.

## 1. vision

Food that is still good is thrown away while people go hungry, and organic waste that could be transformed rots in landfills and emits gases. grinflow connects the two. Three things block that today:

1. shelf life: value drops by the hour.
2. geography: surplus is never where the need is.
3. coordination: nobody knows who has what, who can take it, or whether it arrived.

grinflow is a self-standing web product. WhatsApp is one channel into it (a feature), not the product. Everything a user can do on WhatsApp must also be possible in the web app, with more detail and precision, and the day-to-day quick actions stay easy from WhatsApp.

## 2. principles (non-negotiable)

- A person decides. Models propose, rules filter, a human signs. No dispatch happens on its own.
- Food safety is never certified by a photo or a model. Unknown or unconfirmed condition never goes to people.
- Cascade for every lot: food for people, then material transformation by a maker, then compost.
- Only verified outcomes count as impact. Impact is kept per route and never summed.
- Every model call at runtime is a Meta model through the Meta Model API. Calls are off unless `MODEL_API_KEY` is set and `META_CALLS_ENABLED=true`; otherwise a labeled local fallback runs. Screens always say which provider ran and how many calls it cost.
- Privacy by default: an organization sees only its own data. Never expose names, addresses or phone numbers of others.
- Production quality only: no demo data presented as real, no invented numbers. Empty states are useful and honest. Estimates (CO₂, water, "meals") show their assumptions and source.
- UI text is lowercase (see `docs/design-system.md`). Spanish first, English available where it already exists.

## 3. users

| role | who | main jobs |
| --- | --- | --- |
| donor (`donor`) | restaurant, supermarket, farm, bakery | publish a surplus (text and photos), see where it went, hand it off |
| receiver (`receiver`) | food bank, community kitchen | say what they can receive, accept or hold offers, choose pickup or delivery, confirm receipt |
| maker (`maker`) | workshop or lab that transforms organic material (e.g. eggshell to biomaterial) | say which materials and specs they accept, receive offers for non-edible organics |
| compost (`compost`) | composting operator | receive the remaining organic flow |
| team (`team`) | grinflow staff | verify organizations, review flagged offers, sign agent proposals |

## 4. product requirements

Each epic is one pull request (or a short stack). Acceptance criteria are what a reviewer will test.

### E1. organization accounts and data isolation (P0)
- Email and password accounts with Firebase Auth (client in `lib/firebase/client.ts`, server verification in `lib/firebase/verify.ts`; never import `firebase-admin/auth`).
- Registration (web) creates the account and links it to the registration (`ownerUid`). Until the team verifies it in `/team`, the account is pending and sees a clear "pending verification" state.
- Every read and write of an organization's data is authorized on the server from the verified ID token and `ownerUid`. Never rely on hiding things in the UI.
- Acceptance: automated tests prove an organization cannot read or modify another's registration, offers, missions or messages; 401 without a token, 403 for another organization's resource; team role can see all through `/team` only.
- Out of scope: login by WhatsApp code (needs approved outbound templates).

### E2. organization home `/mi` (P0)
- Greets the organization by name. The view depends on role: donor (my offers and where they went), receiver (offers for me, holds, deliveries), maker (materials I accept, incoming offers), compost (incoming organics).
- Widgets use only real data of that organization: kg given or received, kg diverted from landfill (maker and compost), upcoming missions, early-bird style badges computed from real data. Honest empty states when there is no data.
- Acceptance: new account shows empty states; after a completed mission the widgets change; no widget reads another organization's data.

### E3. publish an offer (P0)
- From `/mi` a donor publishes an offer with a form (item, amount and unit, condition, window, location, notes) and photos. The existing intake pipeline and agent (`lib/intake/`, `lib/agent/`, photo policy in `lib/meta/photo-policy.ts`) analyze it; a person still signs.
- Offers reach eligible receivers by the existing network engine (`lib/network/`: eligibility, zones, cascade, waves of three, partial holds that expire) and are shown by role: banks and kitchens first, makers for transformable organics, compost last.
- Acceptance: tests that a donor offer creates a case; ineligible receivers are not notified; unknown condition never reaches people; works with Meta off (local fallback labeled) and with Meta on.

### E4. receive and respond (P0)
- Receivers and makers see offers addressed to them, accept or hold a partial quantity, and choose pickup (free) or delivery (cost accepted by the receiver; quotes are simulated until a real courier exists and must be labeled so).
- Acceptance: holds expire correctly, partial holds never exceed what is left, the donor cannot approve receivers but can stop a handoff over an anomaly.

### E5. missions and QR close (P0)
- Accepting creates a mission with a collection window, details and a QR. The collector scans it in `/scan` with the phone camera; a valid scan completes the mission for the organization that accepted it and records verified receipt.
- If the window passes without pickup, the lot returns to the cascade (next wave or next tier).
- Acceptance: tests for valid scan, repeated scan (idempotent), wrong code, expired window, scan by the wrong user.

### E6. map (P1)
- Map without paid keys (OpenStreetMap tiles) showing the organization's own pickup point and, per offer, eligible destinations by zone a/b/c, without exposing exact addresses of others before a hold is accepted.

### E7. impact (P1)
- Own-data impact view per organization. Estimated CO₂ and water avoided only with documented factors, shown with source and assumptions. Optional printable report from the same data.
- Network-wide numbers are visible to the team only, or published only as anonymized aggregates by an explicit decision.

### E8. installable app (P1)
- PWA: web manifest, icons, service worker for offline shell, install prompt. The goal is that it opens like an app on a phone. A native APK is out of scope for now (it can wrap this PWA later with a trusted web activity).

### E9. notifications (P2)
- In-app notification list. WhatsApp notifications use the existing sender only when `WHATSAPP_REPLIES_ENABLED=true` and templates are approved.

## 5. non-goals now

- Login by WhatsApp code; real courier integration (Uber Direct and others); oil as its own category; native mobile build; public dashboards of everyone's data.

## 6. data and security rules

- Firestore rules stay deny-all for clients; the server uses the Admin SDK and enforces authorization.
- Secrets only in server environment variables; never in the repo, logs or client bundle.
- Rate limits on public endpoints stay (`lib/whatsapp/rate-limit.ts`). New public write endpoints must use them.
- Photos: size and type limits as in `lib/intake`; no location metadata leaked to other organizations.

## 7. how to slice the work

1. E1 accounts and isolation (with tests). Nothing else starts before this is green.
2. E2 `/mi`, E3 publish, E4 respond.
3. E5 scanner and missions, E6 map.
4. E7 impact, E8 PWA, E9 notifications.
Each slice: its own branch, tests, push, no PR from the agent (a human opens it). WhatsApp webhook and handler keep working unchanged.

## 8. definition of done

- `pnpm test` and `pnpm typecheck` pass; `pnpm build` passes.
- New behavior has tests, including negative and isolation cases.
- The whole flow was run against a local production build (`pnpm build && pnpm start`) with a real browser or HTTP calls, not only unit tests: register, verify, publish, respond, scan, and the empty states.
- No secrets, no demo data presented as real, no uppercase UI text.
- A short note in the PR description of what was verified and what was not (for example, real Meta or WhatsApp calls need credentials).
