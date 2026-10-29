# Questions for Meta office hours — GrinFlow

## Ask these first (highest leverage)

### 0. Photo input with structured output (we now ship this behind a flag)
> We send a donor's photo to `muse-spark-1.3` through `/v1/chat/completions` as an OpenAI-style content part (`{type: "image_url", image_url: {url: "data:image/jpeg;base64,..."}}`) together with `response_format: {type: "json_schema"}`. Is that the supported shape, or should images go through another field or endpoint? Are base64 data URLs accepted, and what are the size and resolution limits? Do images and `json_schema` work together on this model? How are image tokens billed, so we can size our downscaling (we send ≤1024px JPEG)?

### 0b. Judging and agents
> Our agent uses Muse Spark only to read messages and photos; matching, safety gates and approvals are deterministic code with a human decision. Does that count as a strong "agentic" use of Meta models for judging, or do judges expect tool-calling where the model drives the steps?

### 1. Model listed but invocation fails / API key works locally but not on hosting
> We are building a Next.js app for the Meta Global AI Developer Hackathon. Our server-side integration uses `https://api.meta.ai/v1`, model `muse-spark-1.3`, and the OpenAI SDK's Chat Completions interface with JSON output. What is the currently supported request endpoint and SDK pattern for Muse Spark 1.3? Is `response_format: { type: "json_object" }` supported for this model, or should we use the Responses API / another structured-output format?

### 2. Key / model permissions / account credits
> Some builders report that `GET /v1/models` succeeds and lists models, but generation requests fail or say no model is available. What exact account, billing, credit, or permission state is required to invoke `muse-spark-1.3`? Is listing a model sufficient to confirm access? What error/status code should we expect when the account is not enabled?

### 3. Deployment requirements
> We plan to deploy the demo to Vercel and keep a public GitHub repository. Are there any IP allowlists, regional restrictions, outbound-network requirements, environment-variable differences, or other reasons why the same API key would work locally but fail on Vercel/Railway? Which sanitized headers and response fields should we capture for debugging?

## Ask if there is time

### 4. Combining Meta models
> Our proposed pipeline uses Muse Spark for text extraction and decision support, while keeping matching and safety/feasibility rules deterministic in application code. Would you recommend a single Muse Spark call for extraction, or a tool-calling agent with deterministic tools? Are there any hackathon-specific requirements for which Meta model must be the primary model?

### 5. Muse Spark Open / hosted inference
> If we also evaluate `meta-models/muse-spark-open-1026` through Baseten or another approved inference partner, is that considered valid Meta-model use for judging? Are there any differences in the required attribution or disclosure between the hosted Meta Model API and an open-weight model served by a partner?

### 6. Multimodal / SAM 3.1
> We are intentionally keeping the first demo text-first. If we later add a photo as optional evidence, which endpoint and input format are supported for Muse Spark multimodal input or SAM 3.1? We would not infer food safety from an image; the image would only help describe visible packaging/items.

### 7. Credits and billing safeguards
> After hackathon credits are applied, how can we verify the balance and confirm that requests are drawing from credits? Does the spend limit stop requests or only send notifications? Is a payment method required even when credits are available, and is the temporary authorization hold expected?

### 8. Judging / demo expectations
> For a startup building on an existing concept, what is the best way to identify the code and functionality built during the hackathon? Is a public GitHub repository plus a live hosted demo strongly preferred, and are there any requirements for showing the Meta API call in the 3-minute video?

## Ask the builder who reported the issue

> Could you share the exact HTTP status code and sanitized response body from `/v1/responses` (no API key, authorization header, or private data)? Also, does the same model work through `/v1/chat/completions`, and is the failure only on the deployed host or also locally?

## What not to share publicly

- Never paste an API key, Authorization header, full environment file, or billing details.
- Share only sanitized request path, model ID, status code, provider request ID, and error message.
- Do not include donor/recipient personal data in debugging examples.
