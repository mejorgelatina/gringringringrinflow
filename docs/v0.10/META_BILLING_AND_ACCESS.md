# Meta Model API — billing and access runbook

This runbook incorporates the answer received from Meta office hours on 27 October 2026.

## Before testing inference

1. Open https://dev.meta.ai/help/billing/set-up-billing
2. Add a payment method to the Meta API account. Per the Meta team response, credits alone are not sufficient without a card/payment method.
3. Confirm that hackathon credits are visible on the account's Billing page **before making inference calls**.
4. If card setup fails, follow https://dev.meta.ai/help/billing/payment-failure.
5. Keep `MODEL_API_KEY` server-side. Never use `NEXT_PUBLIC_MODEL_API_KEY`, commit a real key, or paste the key into a public issue.

## Run a diagnostic from the same environment as the app

With Node.js 20+ and the dependencies installed:

```bash
# Set this in your shell or local environment; do not commit it.
export MODEL_API_KEY="your-key"
export META_MODEL_ID="muse-spark-1.3"
npm run smoke:meta
```

The script makes two inference calls (which may consume credits) and one model-listing request:
1. `GET /v1/models` — authentication/listing only; it does not prove inference access.
2. A basic `/v1/chat/completions` request — tests actual inference without structured output.
3. A `/v1/chat/completions` request with `response_format.type: "json_schema"` — tests the structured-output format documented by Meta.

The app uses the same schema-constrained format. Meta's docs describe `json_schema` as constrained decoding for extraction tasks; they do not establish that `json_object` is unsupported, so the old mode should be treated as unverified rather than definitively incompatible.

The script prints HTTP statuses and concise errors, never the API key. Run it locally first, then in the deployment environment with environment variables configured. Do not share unredacted logs.

## Interpreting results

- **GET models fails:** likely key, account, or base URL problem.
- **GET models succeeds; basic inference fails:** follow billing setup, verify a payment method and that credits are visible, then confirm model access.
- **Basic inference succeeds; JSON Schema fails:** capture the sanitized status/error and ask Meta whether the schema keywords are supported. Do not repeatedly retry paid requests.
- **All three pass locally but deployed inference fails:** compare deployment environment variables and sanitized status/error/request ID. Do not send the key in screenshots.
- **Still blocked after billing/account checks:** file a ticket at https://dev.meta.ai/support with Team ID, exact error, and a redacted screenshot. Meta also directed builders to ask in Discord channel `<#1564041959910416434>` during weekday office hours, 10–11 AM ET.

## Important: two distinct model identifiers

- **Direct Meta Model API (this app's current adapter):** `muse-spark-1.3`, with base URL `https://api.meta.ai/v1`, pending confirmation of the current endpoint/request contract and account access.
- **Partner inference path for the open model:** use `meta-models/muse-spark-open-1026` as Meta specifically instructed. This identifier is for the partner side; do not replace the direct API model ID with it unless the inference provider is switched to that partner endpoint.

The answer from Meta confirms the distinction above, but does not yet answer the other questions about official endpoint/request format, deployment-specific networking, or hackathon judging/attribution. Await the organizers' replies before treating those as settled.
