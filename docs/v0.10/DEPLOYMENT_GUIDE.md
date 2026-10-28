# Deployment guide — hackathon demo

## Recommended approach

Use **Vercel for the hosted demo and GitHub for the public source repository**. They serve different purposes: the URL makes the product easy to judge; the repository makes the implementation inspectable. Do not rely on GitHub alone as the only way to experience the app.

## Before connecting Vercel

1. Push the project to a public GitHub repository.
2. Import that repository into Vercel and keep the framework preset as Next.js.
3. Add `MODEL_API_KEY` as a server-side environment variable for Preview and Production. Never use a `NEXT_PUBLIC_` prefix for secrets.
4. For the direct Meta Model API adapter, configure `META_MODEL_ID=muse-spark-1.3` after confirming inference access. Meta clarified that a payment method is required and credits must appear on Billing before calls. For the partner inference path using the open model, Meta specified `meta-models/muse-spark-open-1026`; that is a different provider path, not a drop-in replacement for the direct API model ID.
5. Redeploy after changing environment variables.
6. Test the hosted `/api/intake` endpoint using only synthetic messages.
7. Confirm that an API error does not expose the key, authorization header, or full provider response to the browser.

Before deploying, follow [`META_BILLING_AND_ACCESS.md`](./META_BILLING_AND_ACCESS.md) and run `npm run smoke:meta` in the same environment.\n\n## Verification checklist

- [ ] `npm ci` succeeds from a clean checkout.
- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] With no API key, UI clearly says local fallback and does not imply Meta was called.
- [ ] With a valid API key, UI identifies Meta Model API and the model ID.
- [ ] One synthetic happy-path message produces evidence and a draft.
- [ ] One ambiguous message is flagged for review.
- [ ] One unknown-condition message cannot be proposed for people consumption.
- [ ] One prompt-injection message cannot change the extraction rules.
- [ ] Approve/reject is clearly a local simulation, not a real dispatch.
- [ ] Public demo and GitHub repository open without authentication.

## Known limitation at this cut

Dependencies could not be installed in the current authoring environment before the install timed out. Therefore a production build and live Meta API call have **not** been verified here. Run the checklist in a normal Node/npm environment before sharing the URL as a working demo.
