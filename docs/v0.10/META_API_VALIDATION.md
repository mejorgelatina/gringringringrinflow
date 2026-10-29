# Meta API Validation Notes

## Current intended configuration
- Base URL: `https://api.meta.ai/v1`
- Model ID: `muse-spark-1.3`
- Intended use: single-turn extraction of candidate operational facts from an incoming message.

These settings must be confirmed against the account and current official documentation before claiming live compatibility. A successful model-list request does not prove inference access.

## Structured output
The adapter should use the currently documented structured-output option supported by the selected model, validate the returned object with Zod, and check that quoted evidence is present in the source message. Do not assume that `json_object` and `json_schema` are interchangeable; confirm supported modes and schema keyword limitations with Meta.

## Spend guardrails
- Keep `META_CALLS_ENABLED=false` by default.
- The default `npm run smoke:meta` lists models and makes zero inference calls.
- `--basic` makes one intentional inference request.
- `--structured` makes one intentional structured-output request.
- `--all` makes two inference requests and should only be used deliberately.
- Never put API keys or raw secrets in logs, screenshots, or bug reports.

## Acceptance criteria for a live test
1. Billing and promotional credits are visible in the account.
2. The operator explicitly enables the feature for the test.
3. One synthetic input is sent.
4. HTTP status, model ID, response shape, latency, and usage are recorded without secrets.
5. Zod and source-evidence checks pass, or the sanitized failure is captured.
6. The flag is turned off again after the test.
