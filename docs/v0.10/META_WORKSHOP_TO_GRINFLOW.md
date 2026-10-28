# Meta Agents 101 Workshop → GrinFlow

Status: research/adaptation note, 2026-10-27. This is a product-specific reading guide, not a claim that the workshop code has been executed.

## Source workshop

- Repository: https://github.com/meta-models/legal-agent-workshop
- Recording: https://vimeo.com/1239550947/045ee6e57e
- Live session page: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/live

The repository README describes a two-session workshop. Session 1 builds a tool-using agent loop over a prebuilt kit. Session 2 adds verification checks outside the model's control, evidence requests, resumable runs, and human sign-off. The handbook describes the loop as: model chooses one tool → code executes it → tool result returns to the model → progress is saved; the loop stops when the task is done or the turn limit is reached.

## What GrinFlow should borrow

1. **Agent loop, not an unconstrained chatbot.** The model can select among a small set of explicit tools. Each tool has a narrow input/output contract.
2. **Evidence-backed facts.** Preserve the exact source message and quote supporting every extracted operational field. Reject quotes that are not literal substrings of the source.
3. **Verification outside model control.** Matching hard gates, safety checks, consent requirements, capacity checks, and final status transitions run in ordinary code, not as optional tools the model can skip.
4. **Explicit pause / request for input.** If food condition, quantity, deadline, pickup location, recipient acceptance, or transport availability is unknown, the run asks for confirmation or pauses instead of inventing values.
5. **Saved progress and audit history.** Store each input, extraction, validation result, proposed match, human correction, approval, and final disposition. The current hackathon starter only has session-level demo history; durable persistence remains future work.
6. **Visible agent trace.** Show the user what the agent extracted, which deterministic checks passed/failed, what evidence supports each claim, and why a proposal is blocked.

## What not to copy literally

- The workshop is a legal case-investigation agent; GrinFlow is an operational coordination agent. Reuse the architecture pattern, not the legal domain, tools, prompts, data, or UI.
- Do not let the model decide that food is safe to eat. A model may extract a human's explicit condition statement; it cannot certify food safety from a message or image.
- Do not let the model directly dispatch a vehicle, notify a recipient, or claim a delivery happened. Those are consequential external actions and require explicit authorization and verified integrations.
- Do not put verification only in the prompt or offer it as a tool the agent may ignore.
- Do not represent synthetic routes, fictional capacity, or test messages as real operations or impact.

## Proposed GrinFlow tool surface (MVP)

| Tool | Purpose | Guardrail |
|---|---|---|
| `extract_operational_events` | Convert one message into typed candidate events | Exact evidence quote; schema validation; no inferred safety |
| `request_missing_information` | Generate a concise clarification request | No external send in MVP; human reviews the wording |
| `validate_supply_record` | Validate required fields and uncertainty | Deterministic; model cannot override result |
| `find_candidate_recipients` | Run deterministic compatibility checks | Hard blockers cannot be overridden by ranking |
| `prepare_match_proposal` | Create a human-reviewable proposal | No dispatch; label synthetic data clearly |
| `record_human_decision` | Approve/reject/correct a proposal | Explicit action; preserve previous values and reason |

For the current demo, these may remain ordinary server-side functions rather than a full autonomous multi-step agent. The product value is the reliable handoff between unstructured communication, validated structure, and human-approved coordination—not the number of tools or model turns.

## Suggested workshop learning path

1. Read `HANDBOOK.md` sections 1.7, 2.3, 2.4, 3.2, and 3.3 before running anything.
2. Focus on the agent loop and on checks enforced inside tool implementations.
3. Compare the workshop's evidence quote checks with GrinFlow's `quote` substring validation.
4. Compare the workshop's verification checks with `src/lib/matching.mjs` hard blockers.
5. Only after checking the exact model access and billing path, decide whether to run the workshop. The posted workshop estimate is about US$7; it is an estimate, not a hard spend cap.

## Access and budget caution

The public workshop handbook says its key needs access to `muse-spark-1.3` and `sam-3.1`; its setup calls `./helper setup` and the workshop uses Muse Code plus model calls. The organizer response previously received by the team said that the partner-side open-model ID is `meta-models/muse-spark-open-1026`, and that a successful `GET /v1/models` does not prove inference access. These statements may refer to different access paths. Do not replace one model ID with the other without confirming which endpoint/provider is being used.

Before running the workshop:

- Confirm the hackathon credits are visible on Billing.
- Confirm whether the workshop's required `sam-3.1` and `muse-spark-1.3` calls are covered by the granted credits / current access path.
- Check whether billing offers a hard spend cap or only payment thresholds; don't assume a credit balance prevents additional charges.
- Avoid running `./helper setup` until comfortable that its preflight/model checks will not cause unplanned inference charges.
- Never paste API keys into chat, commit `.env`, or show populated environment values in logs/screenshots.

## Fit with hackathon themes

Strong fit: **Build for Your World**. GrinFlow applies AI to a real coordination problem while respecting existing workflows. Multimodality should be added only where it improves intake—for example, extracting a label or a structured quantity from a donor's photo/document—never as a safety certification shortcut.
