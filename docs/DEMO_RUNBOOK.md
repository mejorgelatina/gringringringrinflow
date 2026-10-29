# 3-minute demo runbook (matches the deployed screens)

Run everything in **labelled local mode** unless a live Meta test has been planned (`META_CALLS_ENABLED=true` for that window only). Every screen says which provider ran and how many Meta calls a submit made.

| Time | Screen | What to do | What it shows |
| --- | --- | --- | --- |
| 0:00–0:20 | Landing `/` | Problem statement | — |
| 0:20–0:55 | `/intake` | Click **English example** (or Spanish), **Interpret** | Item, ~12 boxes marked ESTIMATED, Roma, 16:00, "needs inspection" review reason, provider + call count in the audit trail |
| 0:55–1:25 | `/intake` | **+ Add a photo**, pick **Simulate: visible mold** (local mode) or a real photo (live mode), Interpret again | Photo card: items, count, label text, issues. Human review card: *Donor said / Photo shows / Person confirmed / Used for routing*. People routes blocked. In local mode the photo card says SIMULATED FIXTURE |
| 1:25–2:05 | `/intake` | Human review: choose **Not edible**, quantity 12, **Confirm after inspection** | Only the compost destination becomes feasible; audit line records reviewer, decision, quantity and keeps the model observation. Then Approve: a decision is logged, nothing dispatched |
| 2:05–2:35 | `/whatsapp` | Send **Sample 1**, then **Sample 3** with a photo + **Simulate: mold** | Donor-language reply with one question; step-by-step trace. For the live part, show a real message to the test number and the masked trace under *Recent traces* |
| 2:35–3:00 | `/demo/flow` or close | Offer → missing data → confirmation → route review → decision | Human decision with an ordered event log |

Backhaul has an API (`POST /api/demo/backhaul-preview`) but no screen yet; demonstrate it only with a prepared request, and call it an opportunity preview, not a booking.

Before recording: run `pnpm test`, open `/whatsapp` and check **Live setup**, and keep screenshots from `/mnt/project-files/grinflow-demo/` as a fallback.
