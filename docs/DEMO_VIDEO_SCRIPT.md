# demo video script (3 min, english)

English script for the hackathon video. Rules from the organizers: 3:00 or less, in English, real
footage of the product (no slides), open with one line saying what existed before the event and
what was built during it, and make it clear where Meta's models do real work. Record against
production. Everything on screen is real product behavior; say so when something is simulated.

Opening line (say it in the first 10 seconds):
"Before this event, grinflow was a marketing landing page. During this week we built the
coordination system behind it: intake, matching, human sign-off, tracking and an organization
network, with Meta's Muse Spark reading the messy inputs."

The three problems the video must name (say them, then show them):
1. shelf life: food and organic waste lose value by the hour.
2. geography: the surplus is never where the need is.
3. coordination: nobody knows who has what, who can take it, or whether it arrived.

## scenes (3:00)

| time | screen | what to show | what to say |
|---|---|---|---|
| 0:00–0:20 | landing `/` | hero, then the three cards (give food, receive food, workshop that transforms organic waste) | opening line + "a third of food is wasted while kitchens and makers need it" (cite the FAO figure on screen) |
| 0:20–0:50 | `/send` (or WhatsApp on a phone, or `/whatsapp`) | register an organization in one short conversation: name, colonia, hours, contact, what it accepts, confirm with "sí" | "an organization registers itself in two minutes. nothing enters the network until a person verifies it." |
| 0:50–1:10 | `/team` | sign in, open "por verificar", review, press verificar | "a human checks the data and signs. no signature, no network." |
| 1:10–1:50 | `/send` or `/whatsapp` + trace | send `Tenemos 20 cajas de pan fresco en la colonia Roma, hay que recogerlas antes de las 6 pm.` with a photo. Show the trace: provider, model id, number of Meta calls, photo assessment and the icc card | "Muse Spark turns the message and the photo into structured data: item, amount, condition, deadline. the photo can describe what is visible, but it never certifies that food is safe for people." |
| 1:50–2:25 | `/agent` | propose destination, show the proposal and the checks that run in code, type a reviewer name, approve; show the `/track/GF-…` code | "the agent proposes a destination with cited evidence and stops. rules filter, a person decides, and nothing is dispatched on its own." |
| 2:25–2:45 | `/track/GF-…` | stages like a parcel; pickup and delivery labeled as simulated | "every case is followed like a package: stages, time window, handoff code." |
| 2:45–3:00 | `/network` | the cascade: people → transformation → compost; close on the impact card | "what is not food does not go to the bin: it goes to a maker that transforms it, or to compost. rescue for people, transformation for the rest: that is grinflow." |

How the three problems show up on screen:
- shelf life: the offer carries a time window and safety gates; when time runs out the lot
  moves down the cascade (people, transformation, compost).
- geography: zones a/b/c by travel time; only receivers within reach are eligible.
- coordination: verified registry, waves of notifications, holds, handoff code, tracking.

## making the Meta part visible

- On `/whatsapp`, `/intake` and `/agent`, the trace shows which provider ran (local or Meta),
  the model id and how many Meta calls the turn cost. Keep that panel on screen during scene 1:10–1:50.
- Say it once, plainly: "these calls are live to Meta's Model API with Muse Spark" only when the
  Meta credit window is on and the trace says so. If the trace says local, say "local fallback".
- Where each Meta call runs: extraction of the message (`lib/meta/meta.ts`), photo vision
  (`lib/meta/photo.ts`), the agent's planner and claims judge (`lib/agent/`). All use the Meta
  Model API; no other model provider is called at runtime.

## before recording

- [ ] `pnpm test` and `pnpm typecheck` green on the deployed commit.
- [ ] Meta credit window on only while recording: `MODEL_API_KEY` and `META_CALLS_ENABLED=true`
  in Vercel (Production), redeploy, then turn them off. Cost: a text is 1 call, a photo +1, an
  agent run 5–9. The public endpoints are rate limited to 20 messages per 10 minutes per IP.
- [ ] `/whatsapp` → live setup shows the expected variables before recording.
- [ ] Team account can sign in to `/team` and sees "por verificar".
- [ ] Phone charged if filming WhatsApp; a bread photo ready; registration answers at hand.
- [ ] Never show secrets, `.env`, tokens or unmasked phone numbers.
- [ ] Record the screens in this order and cut to a backup capture if anything is slow.

## plan b if WhatsApp does not cooperate

The web chat at `/send` and the simulator at `/whatsapp` run the exact same handler as the
webhook, so the video can be recorded without a live WhatsApp message. Say so honestly:
"the same conversation works from WhatsApp or from the web". If Meta calls are unavailable,
record in labeled local mode and say it is the local fallback.
