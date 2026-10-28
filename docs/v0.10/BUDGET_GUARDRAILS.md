# Meta Credits and Inference Budget Guardrails

Goal: preserve the US$150 hackathon credits and avoid unintentional pay-as-you-go charges.

## Important distinction

A configured payment method enables billing; it does not by itself cap spending at the promotional credit amount. Official Meta billing documentation says usage is token-based and charges can accrue toward a payment threshold and/or monthly billing date. Verify the actual credit balance and billing controls in the account.

## Before any model run

- [ ] Credits are visible on the Billing page.
- [ ] Current balance / promotional credit balance is recorded.
- [ ] Model ID and provider path are confirmed; do not mix the partner open-model ID with the direct Meta model ID.
- [ ] If available, a hard spend cap is configured; if not, manually monitor usage.
- [ ] The exact test and expected number of model calls are known.
- [ ] The prompt and output are kept short; no full conversation history unless necessary.
- [ ] No automatic retries or loops are enabled for initial smoke tests.

## Test order

1. **No-key local checks**: `npm test`, `node --check scripts/smoke-meta.mjs`. No model spend.
2. **Models endpoint**: use only to diagnose key/model listing; this does not prove inference access.
3. **One basic inference**: one short prompt, low output limit where supported.
4. **One structured-output inference**: only after basic inference works.
5. **Small golden set**: manually choose 3–5 messages; inspect cost before expanding.
6. **Full evaluation**: only after measured per-call cost is understood and the credit balance is checked.

## Workshop-specific caution

The workshop announcement estimates about US$7 in tokens. This is not a contractual cap. It may use Muse Code as a coding agent and call model(s) from the workshop runtime. Verify which usage is charged to the same credits, and whether required models (`muse-spark-1.3`, `sam-3.1`) are accessible under the selected path before setup or execution.

## Operational rule

Never run an unbounded agent loop against a paid model. Set a maximum turn count, maximum output size where supported, no retry loops for initial diagnosis, and a human stop condition. Keep logs sanitized: never print API keys or populated `.env` values.
