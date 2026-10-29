"use client"

import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DEMO_ACTORS, DEMO_DAY, DEMO_DESTINATIONS, DEMO_VEHICLES, demoOffer } from "@/lib/grinflow/demo-data.ts"
import { FlowError } from "@/lib/grinflow/errors.ts"
import {
  answerInteraction,
  expireInteractions,
  proposeDestinations,
  receiveOffer,
  recordDecision,
  requestInformation,
  reviewRoute,
} from "@/lib/grinflow/flow.ts"
import { REQUIRED_FIELDS } from "@/lib/grinflow/gaps.ts"
import { onlyNeedsRouteReview } from "@/lib/grinflow/match.ts"
import type { CaseState, Interaction, OfferCase, OfferFieldName } from "@/lib/grinflow/types.ts"

const START = Date.parse(`${DEMO_DAY}T17:00:00.000Z`)

const FIELD_LABELS: Record<OfferFieldName, string> = {
  product: "Product",
  category: "Category",
  quantity: "Quantity",
  unit: "Unit",
  weightKg: "Weight (kg)",
  condition: "Condition",
  pickupLocation: "Location",
  pickupWindow: "Pickup window",
}

const STATE_LABELS: Record<CaseState, string> = {
  received: "Received",
  needs_information: "Missing data",
  ready_to_match: "Ready to match",
  needs_route_review: "Route needs review",
  proposed: "Awaiting decision",
  no_feasible_option: "No feasible option",
  approved: "Approved (on hold)",
  rejected: "Rejected",
}

const STEPS = ["Offer received", "Missing data", "Confirmation", "Proposed destinations", "Route verified", "Human decision"]

function stepIndex(c: OfferCase): number {
  if (c.decision) return 6
  if (c.state === "proposed") return 5
  if (c.proposals.length > 0) return 4
  if (c.state === "ready_to_match") return 3
  if (c.interactions.length > 0) return 2
  return 1
}

function hhmm(iso: string): string {
  return iso.slice(11, 16)
}

function formatValue(field: OfferFieldName, value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (field === "pickupWindow") {
    const w = value as { start: string; end: string }
    return `${hhmm(w.start)}–${hhmm(w.end)} (UTC)`
  }
  if (field === "condition") return CONDITION_LABELS[String(value)] ?? String(value)
  if (field === "pickupLocation") {
    const p = value as { lat: number; lng: number }
    return `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`
  }
  return String(value)
}

const STATUS_STYLE: Record<string, string> = {
  missing: "border-destructive/50 text-destructive",
  reported: "border-amber-500/60 text-amber-700 dark:text-amber-400",
  confirmed: "border-emerald-600/50 text-emerald-700 dark:text-emerald-400",
}

const STATUS_LABEL: Record<string, string> = { missing: "missing", reported: "reported", confirmed: "confirmed" }

const CONDITION_LABELS: Record<string, string> = {
  edible: "edible",
  past_prime: "past its prime",
  inedible: "not edible",
  unknown: "unknown",
}

const INTERACTION_STATE: Record<string, string> = { pending: "pending", answered: "answered", expired: "expired", cancelled: "cancelled" }

const destinationName = (id: string) => DEMO_DESTINATIONS.find((d) => d.id === id)?.name ?? id
const vehicleName = (id: string) => DEMO_VEHICLES.find((v) => v.id === id)?.label ?? id

export function FlowConsole() {
  const [minute, setMinute] = useState(0)
  const [flow, setFlow] = useState<OfferCase>(() => receiveOffer(demoOffer(), new Date(START).toISOString(), DEMO_ACTORS.donor.id))
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  const now = new Date(START + minute * 60_000).toISOString()
  const current = stepIndex(flow)
  const openInteractions = flow.interactions.filter((i) => i.status === "pending")
  const feasible = useMemo(() => flow.proposals.filter((p) => p.feasible), [flow.proposals])
  const routePending = useMemo(() => flow.proposals.filter(onlyNeedsRouteReview), [flow.proposals])
  const blocked = useMemo(() => flow.proposals.filter((p) => !p.feasible && !onlyNeedsRouteReview(p)), [flow.proposals])

  function act(fn: (c: OfferCase, at: string) => OfferCase, advance = 1) {
    const at = new Date(START + (minute + advance) * 60_000).toISOString()
    try {
      setFlow(fn(flow, at))
      setMinute(minute + advance)
      setError(null)
    } catch (e) {
      if (e instanceof FlowError) setError(e.message)
      else throw e
    }
  }

  function reset() {
    setMinute(0)
    setFlow(receiveOffer(demoOffer(), new Date(START).toISOString(), DEMO_ACTORS.donor.id))
    setDrafts({})
    setError(null)
    setSelected(null)
    setRejectReason("")
  }

  function answer(i: Interaction, responseId: string, text?: string) {
    act((c, at) => answerInteraction(c, i.id, DEMO_ACTORS.donor, { responseId, text }, at))
    setDrafts((d) => ({ ...d, [i.id]: "" }))
  }

  function letExpire() {
    const latest = Math.max(...openInteractions.map((i) => Date.parse(i.expiresAt)))
    const advance = Math.ceil((latest - Date.parse(now)) / 60_000)
    act((c, at) => expireInteractions(c, at), advance)
  }

  const closed = flow.state === "approved" || flow.state === "rejected"

  return (
    <div className="mt-8 flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((label, n) => (
            <li
              key={label}
              className={`rounded-md border px-2.5 py-1.5 font-mono text-[10px] tracking-[0.02em] ${
                n + 1 < current || closed
                  ? "border-foreground/40 text-foreground"
                  : n + 1 === current
                    ? "border-foreground bg-foreground text-background"
                    : "border-dashed border-border text-muted-foreground"
              }`}
            >
              {n + 1}. {label}
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground">Demo clock {hhmm(now)} UTC</span>
          <Badge variant="outline">{STATE_LABELS[flow.state]}</Badge>
          <Button variant="ghost" size="sm" onClick={reset}>
            Reset
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="rounded-md border border-border bg-card p-4 sm:p-5">
        <h2 className="eyebrow">1 · Incoming message</h2>
        <p className="keep-case mt-3 rounded-md bg-secondary px-3 py-2 text-sm">“{flow.offer.rawMessage}”</p>
        <p className="mt-1 text-xs text-muted-foreground">From: {DEMO_ACTORS.donor.name} · via WhatsApp (simulated). English: “Hi, I have 40 boxes of today’s bread. It can be picked up today from 6 to 8 pm.”</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {REQUIRED_FIELDS.map((field) => {
                const f = flow.offer[field]
                return (
                  <tr key={field} className="border-t border-border">
                    <td className="py-2 pr-3 text-muted-foreground">{FIELD_LABELS[field]}</td>
                    <td className="py-2 pr-3">{formatValue(field, f.value)}</td>
                    <td className="py-2 text-right">
                      <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${STATUS_STYLE[f.status]}`}>
                        {STATUS_LABEL[f.status]}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="eyebrow">2 · Missing data and confirmation</h2>
          <div className="flex gap-2">
            <Button size="sm" disabled={closed || flow.state !== "needs_information"} onClick={() => act((c, at) => requestInformation(c, at, 30))}>
              Ask the donor
            </Button>
            <Button size="sm" variant="outline" disabled={openInteractions.length === 0} onClick={letExpire}>
              Let it expire (silence)
            </Button>
          </div>
        </div>
        {flow.interactions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {flow.state === "needs_information" ? "Some data is missing or must be confirmed by the donor." : "Nothing missing."}
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {flow.interactions.map((i) => (
              <li key={i.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm">{i.question}</p>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {i.kind === "confirm" ? "confirm" : "clarify"} · {INTERACTION_STATE[i.status]} · expires {hhmm(i.expiresAt)}
                  </span>
                </div>
                {i.status === "pending" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {i.allowedResponses[0]?.id !== "provide_value" ? (
                      i.allowedResponses.map((r) => (
                        <Button key={r.id} size="sm" variant="outline" onClick={() => answer(i, r.id)}>
                          {r.label}
                        </Button>
                      ))
                    ) : (
                      <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault()
                          answer(i, "provide_value", drafts[i.id] ?? "")
                        }}
                      >
                        <input
                          aria-label={i.question}
                          value={drafts[i.id] ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [i.id]: e.target.value }))}
                          className="h-8 w-40 rounded-md border border-input bg-background px-2 text-sm"
                          placeholder={i.field === "pickupWindow" ? "18:00-20:00" : i.field === "weightKg" ? "60" : ""}
                        />
                        <Button size="sm" type="submit" variant="outline">
                          Reply
                        </Button>
                      </form>
                    )}
                    <span className="self-center text-xs text-muted-foreground">answering as the donor</span>
                  </div>
                ) : (
                  i.response && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Answer: {i.response.text || i.response.label} ({hhmm(i.response.at)})
                    </p>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="eyebrow">3 · Proposed destinations</h2>
          <Button
            size="sm"
            disabled={closed || flow.state !== "ready_to_match"}
            onClick={() => act((c, at) => proposeDestinations(c, DEMO_DESTINATIONS, DEMO_VEHICLES, at))}
          >
            Propose destinations
          </Button>
        </div>
        {flow.proposals.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Proposals appear only once every critical field is confirmed.</p>
        ) : (
          <>
            <ul className="mt-4 flex flex-col gap-3">
              {feasible.map((p) => (
                <li key={p.id}>
                  <label className={`flex cursor-pointer gap-3 rounded-md border p-3 ${selected === p.id ? "border-foreground" : "border-border"}`}>
                    <input
                      type="radio"
                      name="proposal"
                      className="mt-1"
                      disabled={closed}
                      checked={selected === p.id}
                      onChange={() => setSelected(p.id)}
                    />
                    <span className="flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">
                          {destinationName(p.destinationId)} · {vehicleName(p.vehicleId)}
                        </span>
                        <span className="font-mono text-xs">puntaje {Math.round((p.score ?? 0) * 100)}</span>
                      </span>
                      <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                        {p.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {routePending.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">
                  Feasible except for the route. The engine never accepts an unverified route: review the estimate and confirm it.
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {routePending.map((p) => (
                    <li key={p.id} className="flex flex-col gap-2 rounded-md border border-dashed border-foreground/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm">
                        <span className="font-medium">
                          {destinationName(p.destinationId)} · {vehicleName(p.vehicleId)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Straight-line estimate: {p.estimate.distanceKm} km, {p.estimate.durationMinutes} min, arrival{" "}
                          {p.estimate.estimatedArrivalAt ? hhmm(p.estimate.estimatedArrivalAt) : "—"} UTC
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={closed}
                        onClick={() => act((c, at) => reviewRoute(c, DEMO_ACTORS.operator, p.id, DEMO_DESTINATIONS, DEMO_VEHICLES, at))}
                      >
                        Verify route (operator)
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {blocked.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-muted-foreground">{blocked.length} blocked combinations and why</summary>
                <ul className="mt-2 flex flex-col gap-2">
                  {blocked.map((p) => (
                    <li key={p.id} className="rounded-md border border-dashed border-border p-2 text-xs">
                      <span className="font-medium">
                        {destinationName(p.destinationId)} · {vehicleName(p.vehicleId)}
                      </span>
                      <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                        {p.blocks.map((b) => (
                          <li key={b.code}>{b.message}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>

      <section className="rounded-md border border-border bg-card p-4 sm:p-5">
        <h2 className="eyebrow">4 · Human decision</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Decides: {DEMO_ACTORS.operator.name}. Approval places a hold on the supply; pickup and delivery are recorded separately.
        </p>
        {flow.decision ? (
          <p className="mt-3 text-sm">
            <strong>{flow.decision.outcome === "approved" ? "Approved" : "Rejected"}</strong> by {flow.decision.decidedBy} at{" "}
            {hhmm(flow.decision.decidedAt)}
            {flow.decision.proposalId && ` · ${flow.decision.proposalId}`}
            {flow.decision.reason && ` · reason: ${flow.decision.reason}`}
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              size="sm"
              disabled={flow.state !== "proposed" || !selected}
              onClick={() => act((c, at) => recordDecision(c, DEMO_ACTORS.operator, { outcome: "approved", proposalId: selected }, at))}
            >
              Approve selected proposal
            </Button>
            <input
              aria-label="Reason for rejection"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection"
              className="h-8 rounded-md border border-input bg-background px-2 text-sm sm:w-56"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!["proposed", "needs_route_review", "no_feasible_option"].includes(flow.state)}
              onClick={() =>
                act((c, at) => recordDecision(c, DEMO_ACTORS.operator, { outcome: "rejected", proposalId: selected, reason: rejectReason }, at))
              }
            >
              Reject
            </Button>
          </div>
        )}
      </section>

      <section className="rounded-md border border-border bg-card p-4 sm:p-5">
        <h2 className="eyebrow">Event log</h2>
        <ol className="mt-3 flex flex-col gap-1.5">
          {flow.events.map((e) => (
            <li key={e.seq} className="flex gap-3 font-mono text-[11px]">
              <span className="text-muted-foreground">#{e.seq}</span>
              <span className="text-muted-foreground">{hhmm(e.at)}</span>
              <span>{e.type}</span>
              <span className="truncate text-muted-foreground">{e.actorId ?? "system"}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
