# Onboarding: how an organization joins grinflow

An organization registers itself on WhatsApp (or the `/send` web chat) in one short conversation. Nothing it
says enters the network until a person on the grinflow team verifies it in `/team`.

## The conversation

Trigger: any message like "quiero registrar mi organización", "registro", "cómo nos damos de alta" (also the
"registrar mi organización" button on `/send` and the last sample on `/whatsapp`). "cancelar" leaves at any step.

| Step | Question | Stored as |
| --- | --- | --- |
| role | 1 dona · 2 recibe para personas · 3 transforma materiales (maker) · 4 composta (several allowed) | `roles` |
| name | name of the place or organization | `name` |
| location | WhatsApp location pin, or a written address | `location` (pin), or `address` + a pilot colonia point; otherwise the team places it |
| hours | days and hours they hand over or receive ("lunes a viernes de 9 a 6") | `hours` (days + minutes), `hoursText` as written |
| contact | contact person, and their phone if it's another number | `contacts` |
| accepts (receiver, maker, compost) | what they take, specs (limpio, seco, molido…), kg per week | `accepts` |
| pickup (receiver, maker) | pick up with their own people, or send their own courier (an uber) and pay it | `selfPickup` |
| generates (donor) | what they usually have left, how much, how often | `generates` |
| confirm | summary; "sí" also accepts that grinflow writes first on WhatsApp (opt-in) | `whatsappOptIn`, status `pending` |

Parsing is deterministic (`lib/registry/parse.ts`): no model call, so onboarding works with Meta off and never
spends credits. What can't be parsed is kept as written for the team.

## After registering

- `/team` lists pending registrations. A person can place one on the map (if it gave no pin and no known
  colonia), then **verify** or **reject**. Verifying records who did it.
- A verified registration becomes a network participant (`lib/registry/network.ts`): receivers → people tier,
  makers → transformation (matched on their materials), compost → compost. Defaults for anything not declared
  (Mon–Sat 9–18, 100 kg/week) are named constants there.
- A registered donor never repeats its address: an offer with no place uses the registered location, and a pin
  sent during a conversation wins over both.

## Memory

Each sender has a conversation record (`lib/registry/store.ts`): the messages of the offer in progress, the
last location pin, and any registration in progress. When grinflow's last reply asked something, the next
message is read together with the earlier ones, so "son 30 kilos" completes the offer. Memory resets after 2
hours of silence; an unfinished registration after 24 hours.

Storage is Firestore when `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` are set
(collections `gf_registrations`, `gf_conversations`, `gf_inbox`). Without them it is server memory: fine for a
demo on one warm instance, lost on a cold start.

## Environment

| Variable | Effect |
| --- | --- |
| `OPERATOR_KEY` | Unlocks real registrations and contact data in `/team`. Without it `/team` shows only simulator records |
| `NEXT_PUBLIC_GRINFLOW_CARRIERS=on` | Brings back coordinated carriers (quoted courier, backhaul, `/backhaul`). Off by default: not validated yet |
| `WHATSAPP_ALLOWED_SENDERS` | Leave empty for judges to test with their own number |

## Carriers (hidden)

Coordinated transport (courier quotes, backhaul on existing routes) is built but not validated with real
operators. Until it is, a receiver either picks up with its own people or sends its own courier (an uber) and
pays it; grinflow only checks the timing and issues the handoff code (`own_courier` in `lib/network/`).
