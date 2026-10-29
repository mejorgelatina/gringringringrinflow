# Intake agent

`/agent` turns a donor message into one proposal an operator can approve. Muse Spark plans; code checks; a person signs off.

## The loop

Each turn the planner calls exactly one tool. Code runs it, and the result goes back to the planner. The run stops when a tool says a person is needed, a proposal passes every check, the turn budget runs out (8 turns, then 6 per resume), or a model call fails (no retry).

| Tool | What it does | Check that runs inside it |
| --- | --- | --- |
| `extract_event` | Reads the donor's newest message(s) with the existing extractor and merges the answer into the offer | Events whose quote is not an exact substring of the donor's words are dropped |
| `assess_photo` | Runs the existing photo assessment once | `routePhotoAssessment` + `resolveCondition`: a photo can only lower confidence |
| `find_matches` | Runs the deterministic engine (`evaluateCandidates`) | The model never ranks or overrides a blocker |
| `ask_donor` | Asks one question; run stops at `needs_input` with no model calls | Only for a field that is actually missing or uncertain; at most 2 per run; a photo doubt can't be settled by the donor |
| `ask_operator` | Hands off; run stops at `escalated` | Only after `find_matches` found nothing feasible, or when a photo raised a doubt |
| `propose_match` | Ends at `awaiting_approval` | Code rules (pair from the latest `find_matches`, still feasible when re-run, people tier needs effective `edible`, not a pair the operator rejected, every quote is in the donor's words), then a **claims check**: a separate Muse Spark call (`lib/agent/judge.ts`) that refuses a rationale saying more than its quotes. 3 refusals → operator |

The operator approves (simulated, nothing dispatched), rejects with notes (notes go back to the agent), or records an inspection (condition and quantity), which reopens the run.

## Meta calls and credits

Same opt-in as `/api/intake`: `MODEL_API_KEY` **and** `META_CALLS_ENABLED=true`. With Meta off, a scripted planner and a local number check drive the same loop and checks with zero model calls. Tests (`tests/agent.test.ts`) never touch the network.

With Meta on, a run costs one planner call per turn, plus one extraction call per donor message, one photo call, and one claims-check call per proposal: typically 5 to 9 calls.

The planner uses the Responses API with function tools (`client.responses.create`, `parallel_tool_calls: false`, `store: false`); the claims check uses the Responses API with `json_object` output. Not yet run against the live API; check with `pnpm smoke:meta`-style manual testing on the day credits are turned on.

## State

Runs are not stored server-side. The browser holds a sealed copy (`lib/agent/state.ts`, HMAC-SHA256) and sends it back to resume, so a run can't be edited between steps. Set `AGENT_STATE_SECRET` in Vercel; without it a fixed demo key is used and the console says so. Photos are used for one request and never stored.

## Credits

The patterns (an agent loop with one tool per turn, checks inside the tools rather than as tools the model may skip, escalation that pauses the run, human sign-off) are inspired by Meta's [Legal Agent Workshop](https://github.com/meta-models/legal-agent-workshop). No code or prompts were copied: that repository has no license file, and everything here was written for grinflow during the hackathon.
