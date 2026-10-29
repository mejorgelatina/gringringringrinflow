"use client";
import { useMemo, useState } from "react";
import { ALL_CONFIRMED, DEMO_CANDIDATES, DEMO_TRIP, NONE_CONFIRMED, evaluateDemo, type CandidateToggles, type TripToggles } from "@/lib/backhaul/demo";
import s from "./backhaul.module.css";

const TOGGLE_LABELS: Record<keyof CandidateToggles, string> = {
  donorConsent: "Donor confirmed and agreed to share details",
  quantityConfirmed: "Quantity confirmed",
  conditionConfirmed: "Condition confirmed by a person",
  routeReviewed: "Route reviewed by operator (straight-line estimate)"
};
const stamp = () => new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

export default function Backhaul() {
  const [trip, setTrip] = useState<TripToggles>({ vehicleConfirmed: true, originalDeliveryConfirmed: true, transportPermissionConfirmed: false });
  const [toggles, setToggles] = useState<Record<string, CandidateToggles>>(() => Object.fromEntries(DEMO_CANDIDATES.map(c => [c.id, { ...NONE_CONFIRMED }])));
  const [decisions, setDecisions] = useState<Record<string, "approved" | "rejected">>({});
  const [audit, setAudit] = useState<string[]>(["Preview started · synthetic trip · no driver is contacted"]);
  const results = useMemo(() => evaluateDemo(trip, toggles), [trip, toggles]);
  const feasible = results.filter(r => r.feasible).length;

  const setToggle = (id: string, key: keyof CandidateToggles, value: boolean) => {
    setToggles(t => ({ ...t, [id]: { ...t[id], [key]: value } }));
    setDecisions(d => { const { [id]: _, ...rest } = d; return rest; });
  };
  const confirmAll = () => { setTrip(t => ({ ...t, transportPermissionConfirmed: true })); setToggles(Object.fromEntries(DEMO_CANDIDATES.map(c => [c.id, { ...ALL_CONFIRMED }]))); setDecisions({}); setAudit(a => [`${stamp()} · Operator marked all confirmations (demo shortcut)`, ...a]); };
  const decide = (id: string, title: string, value: "approved" | "rejected") => {
    setDecisions(d => ({ ...d, [id]: value }));
    setAudit(a => [`${stamp()} · ${value === "approved" ? "Approved for driver contact" : "Rejected"}: ${title} · simulated, nothing was sent or booked`, ...a]);
  };

  return <main className="shell">
    <header className="topbar"><a className="wordmark" href="/intake"><span className="mark">g</span> grinflow</a><div className="topmeta"><span className="dot"/> return trips · synthetic data <a href="/intake" style={{marginLeft:12,color:"#087c62",fontWeight:700,textDecoration:"none"}}>intake ↗</a><a href="/whatsapp" style={{marginLeft:12,color:"#087c62",fontWeight:700,textDecoration:"none"}}>whatsapp ↗</a></div></header>
    <section className="hero"><div className="eyebrow">backhaul · capacity that already moves</div><h1>The van is already<br/><em>driving back.</em></h1><p className="lede">After a confirmed drop-off, GrinFlow looks for a second pickup on the way back. It only proposes trips that save kilometers, fit the load and pass every safety gate. A person decides; nothing is booked.</p></section>
    <div className="warning"><span className="warning-icon">!</span><div><strong>opportunity preview, not a booking</strong><p>Distances are synthetic straight-line estimates that an operator reviews by hand. No driver is contacted, no route provider is called and no Meta model is used on this screen.</p></div></div>

    <section className="section-block"><div className="section-head"><div><div className="eyebrow">01 — the trip</div><h2>{DEMO_TRIP.vehicle} just finished a delivery.</h2><p className="subhead">{DEMO_TRIP.firstDrop}. Returning empty to the {DEMO_TRIP.returnTo} until 18:00.</p></div><span className="step">{feasible} feasible · {results.length - feasible} blocked</span></div>
      <div className={s.trip}><div className={s.fact}><span>Usable capacity</span><strong>{DEMO_TRIP.capacity} kg</strong></div><div className={s.fact}><span>Load after drop-off</span><strong>{DEMO_TRIP.loadAfterDropoff} kg</strong></div><div className={s.fact}><span>Empty return avoided if used</span><strong>up to 9.4 km</strong></div></div>
      <div className={s.toggles}>
        <label className={s.toggle}><input type="checkbox" checked={trip.vehicleConfirmed} onChange={e => setTrip({ ...trip, vehicleConfirmed: e.target.checked })}/>Driver confirmed availability</label>
        <label className={s.toggle}><input type="checkbox" checked={trip.originalDeliveryConfirmed} onChange={e => setTrip({ ...trip, originalDeliveryConfirmed: e.target.checked })}/>First delivery confirmed</label>
        <label className={s.toggle}><input type="checkbox" checked={trip.transportPermissionConfirmed} onChange={e => setTrip({ ...trip, transportPermissionConfirmed: e.target.checked })}/>Carrier allows this cargo</label>
        <button className="secondary" onClick={confirmAll}>Confirm everything (demo)</button>
      </div>
    </section>

    <section className="section-block"><div className="section-head"><div><div className="eyebrow">02 — second pickups on the way back</div><h2>Hard rules first, then savings.</h2><p className="subhead">Net benefit = empty kilometers avoided − extra kilometers driven. Only positive, fully confirmed options can be approved.</p></div></div>
      {results.map(r => { const c = DEMO_CANDIDATES.find(x => x.id === r.offerId)!; const t = toggles[c.id]; const d = decisions[c.id]; return <article key={c.id} className={`${s.card} ${r.feasible ? s.ok : ""}`} aria-label={c.title}>
        <div className={s.cardHead}><div><h3>{c.title}</h3><p>{c.donor} → {c.recipientName}</p></div><span className={`status ${r.feasible ? "ok" : "blocked-status"}`}>{d ? (d === "approved" ? "Approved (simulated)" : "Rejected") : r.feasible ? "Feasible" : "Blocked"}</span></div>
        <div className={s.numbers}><span><b>{c.route.incrementalKm} km</b>extra</span><span><b>{c.route.emptyKmAvoided} km</b>empty avoided</span><span><b>{r.netKmBenefit ?? "—"}{r.netKmBenefit != null ? " km" : ""}</b>net</span><span><b>{c.offer.quantity} kg</b>load</span>{r.score != null && <span><b>{r.score.toFixed(2)}</b>score ({r.scoreVersion})</span>}</div>
        <div className={s.toggles}>{(Object.keys(TOGGLE_LABELS) as (keyof CandidateToggles)[]).map(k => <label key={k} className={s.toggle}><input type="checkbox" checked={t[k]} onChange={e => setToggle(c.id, k, e.target.checked)}/>{TOGGLE_LABELS[k]}</label>)}</div>
        {r.blockers.length > 0 && <ul className={s.blockers}>{r.blockers.map(b => <li key={b.code}>{b.message}</li>)}</ul>}
        {r.feasible && !d && <div className={s.actions}><button className="secondary" onClick={() => decide(c.id, c.title, "rejected")}>Reject</button><button className="primary" onClick={() => decide(c.id, c.title, "approved")}>Approve for driver contact ↗</button></div>}
        {r.feasible && <p className={s.note}>Approval only records a decision. Contacting the driver and booking the route stay manual.</p>}
      </article>; })}
    </section>

    <section className="section-block audit-section"><div className="section-head"><div><div className="eyebrow">03 — audit trail</div><h2>Every decision leaves a trace.</h2></div><span className="step">session only</span></div><div className="audit-list">{audit.map((entry, i) => <div className="audit-row" key={`${entry}-${i}`}><span className="audit-dot"/><span>{entry}</span></div>)}</div></section>
    <footer><div className="wordmark"><span className="mark">g</span> grinflow</div><p>We don’t replace existing infrastructure. We make it work together.</p><span>Engine: lib/engines/backhaul.mjs · grinflow-backhaul-v1</span></footer>
  </main>;
}
