# Run the WhatsApp channel with your own Cloud API test number

GrinFlow receives donor messages and photos through the WhatsApp Cloud API webhook at `/api/whatsapp/webhook`, runs the same intake pipeline as `/intake`, and replies with one useful question. Nothing is booked or dispatched; a person reviews every offer.

You can check the whole flow without WhatsApp at **`/whatsapp`**: the simulator calls the exact same handler and shows each step (validation, model or fallback, safety gate, matching, reply).

## What it costs

| Event | Meta model calls | WhatsApp sends |
| --- | --- | --- |
| Text message, `META_CALLS_ENABLED` not `true` | 0 (local fallback) | 0 unless replies are enabled |
| Text message, real mode | 1 | 1 reply (within the 24h window the donor opened) |
| Photo + caption, real mode | 2 (text + vision) | 1 reply |
| Redelivered webhook (same message id) | 0 (deduplicated) | 0 |
| Sender not on `WHATSAPP_ALLOWED_SENDERS` | 0 | 0 |

A failed model or media call is not retried. The webhook always answers 200 after a valid signature, because a non-200 makes Meta redeliver and would repeat calls.

## Setup (about 15 minutes)

1. In the Meta developer dashboard, create an app with the **WhatsApp** product, or open the one you already have. Follow Meta's current docs if the screens differ: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
2. Open **WhatsApp → API Setup**. Note the **test phone number**, its **Phone number ID**, and generate an **access token** (the temporary one lasts 24 hours; use a system-user token for anything longer). Add your own phone as a **recipient** (test numbers can only message verified recipients).
3. In **App settings → Basic**, copy the **App secret**.
4. In Vercel → Project → Settings → Environment Variables (Production), add:

   | Variable | Value |
   | --- | --- |
   | `WHATSAPP_VERIFY_TOKEN` | any random string you choose |
   | `WHATSAPP_APP_SECRET` | the app secret (used to check `X-Hub-Signature-256`) |
   | `WHATSAPP_ACCESS_TOKEN` | the access token |
   | `WHATSAPP_PHONE_NUMBER_ID` | the test number's Phone number ID |
   | `WHATSAPP_ALLOWED_SENDERS` | your phone in international format, comma-separated (recommended) |
   | `WHATSAPP_REPLIES_ENABLED` | `true` only when you want real replies |
   | `WHATSAPP_GRAPH_VERSION` | optional, defaults to `v22.0` |

   Model calls still follow `MODEL_API_KEY` + `META_CALLS_ENABLED=true`. Without them the channel works end to end with the labelled local fallback.
5. Redeploy, then in **WhatsApp → Configuration → Webhook** set the callback URL to `https://<your-production-domain>/api/whatsapp/webhook` and the verify token from step 4. Subscribe to the **messages** field. Use the production domain: preview deployments are usually behind Vercel authentication, which blocks Meta.
6. From your phone, message the test number, for example: *"Tenemos 20 cajas de pan fresco en la colonia Roma, hay que recogerlas antes de las 6 pm."* Then send a photo with a caption.
7. Open `/whatsapp` on the same deployment. **Live setup** shows which variables are present (booleans only), and **Recent traces** lists webhook deliveries with masked numbers and no message text. Traces live in server memory per instance, so they are a demo aid, not an audit log.

## Safety rules the channel inherits

- A photo never marks food as fit for people. Visible damage, an unreadable photo or a failed vision call keeps people routes blocked until an operator confirms on `/intake`.
- Message and image text are treated as data, never instructions.
- Images are downloaded only to be assessed, are limited to JPEG/PNG/WebP under 2 MB, and are never stored or logged.
- Unsigned or wrongly signed requests get 401 and never reach the model.

## Verify locally without Meta

```bash
WHATSAPP_APP_SECRET=dev WHATSAPP_VERIFY_TOKEN=dev pnpm build && WHATSAPP_APP_SECRET=dev WHATSAPP_VERIFY_TOKEN=dev pnpm start
curl "localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=dev&hub.challenge=ok"   # → ok
BODY='{"entry":[{"changes":[{"value":{"messages":[{"id":"wamid.local1","from":"5215512345678","timestamp":"1","type":"text","text":{"body":"Tenemos 20 cajas de pan en la colonia Roma"}}]}}]}]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac dev | cut -d' ' -f2)
curl -s -X POST localhost:3000/api/whatsapp/webhook -H "x-hub-signature-256: sha256=$SIG" -H 'content-type: application/json' -d "$BODY"   # → {"ok":true,"handled":1}
curl -s localhost:3000/api/whatsapp/status   # trace with reply "preview"
```

## Web chat and QR (built during the hackathon)

- `/send` is the web version of this channel. It calls `/api/message`, which runs the same `handleInbound` handler as the webhook, so a message on the page and on WhatsApp gets the same reply. The page sends the earlier messages of the conversation along, so a short follow-up ("hasta las 6 pm") completes the offer. Web traces are withheld from the public status view like webhook traces. A per-instance cap of 20 messages per 10 minutes per IP protects model credits.
- `/qr` prints two codes: "tengo comida para donar" and "mi organización puede recibir comida" (`?lang=en` for English).
  - Set `GRINFLOW_WHATSAPP_NUMBER` (digits, international format, e.g. `5215512345678`) and the codes open `https://wa.me/<number>` with the first message already written.
  - Without it, the codes open `/send?intent=give|receive`, which starts the same conversation in the browser.
- Organizations that can receive food are read as `demand_declared`. The reply restates what was noted, asks for the first missing detail (quantity, kind of food, place, receiving hours), and says a person verifies the organization before any food is sent. Nothing is matched or booked automatically.
