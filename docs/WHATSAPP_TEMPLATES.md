# WhatsApp: the closed loop and the message templates

## What happens now, end to end

1. **A donor writes** (WhatsApp, `/send` or the `/whatsapp` simulator). The intake reads the offer and, if
   something important is missing, asks one question.
2. **A complete offer opens an agent run by itself** (`lib/whatsapp/agent-bridge.ts`). After the donor has
   answered one question, the agent takes over the asking, with its own limit and hand-off to a person, so
   the chat can't loop. The donor gets the tracking link (`/track/GF-…`) in the same reply.
3. **The donor's next message goes to that run** while it waits for them (`Conversation.activeRun`), not to
   a new intake.
4. **The team sees the run in `/team`** (inbox column "destinos viables": code + state). "revisar y firmar"
   opens the latest server copy in `/agent` (`/api/agent/open`, team sign-in or operator key).
5. **On approval** (`/api/agent/resume`) grinflow plans the notices (`lib/whatsapp/notify.ts`):
   - the **donor**: free text inside 24 h of their last message, else template `grinflow_donacion_aprobada`;
   - the **destination**, if it is a verified registered organization with WhatsApp opt-in: template
     `grinflow_donacion_asignada` (grinflow writes first, so it must be a template).
6. **On verification** in `/team`, the organization gets `grinflow_registro_verificado`.
7. Every notice is stored in the outbox (Firestore `gf_outbox`, or memory) and listed in `/team` →
   "avisos por whatsapp" with its exact text and status: `enviado`, `vista previa`, `no enviado` (no opt-in)
   or `falló`.

## Gates (nothing is sent by accident)

| Message | Sent only when |
| --- | --- |
| Free text to the donor | `WHATSAPP_REPLIES_ENABLED=true` + access token + phone number id, and the donor wrote by WhatsApp (never to simulator or web chat senders) |
| Any template | all of the above **and** `WHATSAPP_TEMPLATES_APPROVED=true` |
| To a destination organization | also its WhatsApp opt-in from onboarding |

Agent runs follow the same model opt-in as everything else: without `META_CALLS_ENABLED=true` the scripted
planner runs and no Meta credits are spent. With Meta on, each complete offer costs one agent run (a few
planner and judge calls) on top of the intake. Set `GRINFLOW_AUTO_AGENT=off` to go back to opening runs by
hand from `/team`.

## Templates to submit in WhatsApp Manager

WhatsApp Manager → Account tools → Message templates → Create template. Category **Utility**, language
**Spanish (MEX)** (`es_MX`), body only, no header or buttons. Names and bodies must match exactly what
`TEMPLATES` in `lib/whatsapp/notify.ts` sends. Approval usually takes minutes to a few hours.

### `grinflow_donacion_aprobada` (donor, outside the 24 h window)

```
tu donación {{1}} ya tiene destino: {{2}}. sigue la recolección aquí: {{3}}. gracias por no dejar que se desperdicie.
```

Examples: `{{1}}` GF-1A2B3C4D · `{{2}}` comedor comunitario la esperanza · `{{3}}` https://grinflow.app/track/GF-1A2B3C4D

### `grinflow_donacion_asignada` (destination organization)

```
hola {{1}}, grinflow les apartó una donación: {{2}}. {{3}}. código de entrega: {{4}}. si ya no pueden recibirla, respondan a este mensaje para liberarla.
```

Examples: `{{1}}` comedor la esperanza · `{{2}}` 20 cajas de pan (60 kg estimado) en roma norte · `{{3}}` recogen ustedes antes de las 18:00 · `{{4}}` GF-1A2B3C4D

### `grinflow_registro_verificado` (organization, after verification)

```
{{1}} ya está verificada en la red de grinflow. les escribiremos por aquí cuando haya alimento o material para ustedes.
```

Example: `{{1}}` comedor la esperanza

Once all three show **Active**, set `WHATSAPP_TEMPLATES_APPROVED=true` in Vercel and redeploy.

## Not built yet

- A destination's reply ("ya no podemos") does not release the hold automatically; the team sees it in the
  inbox and acts in `/agent`.
- Delivery receipts (sent → delivered → read) from the webhook's `statuses` are not tracked.
- Template language is Spanish only.
