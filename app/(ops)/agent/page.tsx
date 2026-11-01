"use client";
import { useEffect, useState } from "react";
import type { Tracking } from "@/lib/agent/tracking";
import type { AgentRun, AgentStatus } from "@/lib/agent/types";
import { loadSaved, readRun, save, TrackingCard } from "./tracking-card";
import { IccCard } from "../icc/icc-card";
import s from "./agent.module.css";

const EXAMPLES = [
  { label: "clear offer", text: "Tenemos 20 cajas de pan fresco en la colonia Roma, hay que recogerlas antes de las 6 pm." },
  { label: "needs a question", text: "Nos sobraron como unas 15 cajas de jitomate en Centro" },
  { label: "with a photo", text: "Tenemos 12 cajas de manzanas frescas en la colonia Roma, recoger antes de las 4 pm" },
  { label: "photo, no count", text: "Nos quedaron estas cajas de comida. Las pueden recoger hoy." },
  { label: "supermarket returns", text: "Somos el súper de la colonia Roma: tenemos 3 cajas de huevos echados a perder por devoluciones, recoger antes de las 6 pm" }
];
const STATUS: Record<AgentStatus, { label: string; tone: string }> = {
  running: { label: "running", tone: "review" },
  needs_input: { label: "waiting for the donor", tone: "review" },
  awaiting_approval: { label: "waiting for sign-off", tone: "review" },
  escalated: { label: "handed to an operator", tone: "blocked-status" },
  approved: { label: "approved · simulated", tone: "ok" },
  paused: { label: "paused", tone: "blocked-status" }
};

async function toDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export default function AgentConsole() {
  const [message, setMessage] = useState(EXAMPLES[0].text);
  const [image, setImage] = useState<string | null>(null);
  const [fixture, setFixture] = useState<"" | "clean" | "mold" | "containers">("");
  const [run, setRun] = useState<AgentRun | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [token, setToken] = useState("");
  const [signed, setSigned] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [whatsappReply, setWhatsappReply] = useState("");
  const [reviewer, setReviewer] = useState("operator (demo)");
  const [notes, setNotes] = useState("");
  const [inspected, setInspected] = useState<"" | "edible" | "past_prime" | "inedible">("");
  const [qty, setQty] = useState("");
  const [kg, setKg] = useState("");

  async function call(url: string, body: unknown) {
    setBusy(true); setError("");
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.message || "the agent could not continue");
      setRun(d.run); setTracking(d.tracking); setToken(d.token); setSigned(d.stateSigned); setReply(""); setWhatsappReply(d.whatsappReply ?? ""); setNotes("");
      save({ code: d.run.code, token: d.token, at: new Date().toISOString(), headline: d.tracking.headline });
    } catch (e) { setError(e instanceof Error ? e.message : "unexpected error"); }
    finally { setBusy(false); }
  }
  // /agent?code=gf-… reopens a collection started in this browser, so an operator can act on it.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code")?.toUpperCase();
    const saved = code ? loadSaved().find(x => x.code === code) : undefined;
    if (saved) fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: saved.token }) }).then(r => r.json()).then(d => { if (d.ok) { setToken(saved.token); setTracking(d.tracking); setRun(readRun(saved.token)); } }).catch(() => {});
  }, []);
  const start = () => { setRun(null); setTracking(null); call("/api/agent", { message, ...(image ? { image, ...(fixture ? { photoFixture: fixture } : {}) } : {}) }); };
  const resume = (action: Record<string, unknown>) => call("/api/agent/resume", { token, action });
  async function pickPhoto(file: File | undefined) {
    setError("");
    if (!file) { setImage(null); return; }
    try { setImage(await toDataUrl(file)); } catch { setImage(null); setError("could not read that image. try a jpeg or png; nothing was sent."); }
  }

  return <main className="shell">
    <header className="topbar"><a className="wordmark" href="/intake"><img src="/grinflow-logo.svg" alt="grinflow"/></a><div className="topmeta"><span className="dot"/> intake agent · muse spark <a href="/intake" style={{ marginLeft: 12, color: "#087c62", fontWeight: 700, textDecoration: "none" }}>web intake ↗</a></div></header>
    <section className="hero"><div className="eyebrow">agent console</div><h1>the model decides.<br/><em>the checks don&apos;t move.</em></h1><p className="lede">muse spark picks one tool per turn: read the message, look at the photo, ask the matching engine, ask the donor, hand off, or propose. every lot is characterized with icc first (weight, volume, condition, risk, each marked declarado, estimado, medido or verificado), and every proposal passes code rules and a second reviewer before a person signs off.</p></section>
    <div className="warning"><span className="warning-icon">!</span><div><strong>synthetic data · simulated operations</strong><p>nothing is sent to donors, recipients or drivers from this page. donor replies below are typed by you.</p></div></div>

    <section className="workbench">
      <div className="section-head"><div><div className="eyebrow">01 — donor message</div><h2>start a run.</h2></div><span className="step">one message → one proposal</span></div>
      <div className="example-row"><span>try:</span>{EXAMPLES.map(e => <button key={e.label} className="secondary" onClick={() => setMessage(e.text)}>{e.label}</button>)}</div>
      <label htmlFor="message">incoming message</label>
      <textarea id="message" className="keep-case" value={message} onChange={e => setMessage(e.target.value)} maxLength={5000}/>
      <div className="photo-row"><label className="photo-pick" htmlFor="photo">{image ? "change photo" : "+ add a photo (optional)"}</label><input id="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => pickPhoto(e.target.files?.[0])} hidden/>{image && <><img className="photo-thumb" src={image} alt="donor photo preview"/><button className="secondary" onClick={() => setImage(null)}>remove</button><label className="fixture-pick">offline demo result<select value={fixture} onChange={e => setFixture(e.target.value as typeof fixture)}><option value="">not analyzed</option><option value="clean">simulate: looks intact</option><option value="mold">simulate: visible mold</option><option value="containers">simulate: ~12 food containers</option></select></label></>}</div>
      <div className="input-foot"><span>{message.length}/5,000 characters</span><button className="primary" onClick={start} disabled={busy || !message.trim()}>{busy ? "running…" : "run the agent ↗"}</button></div>
      {error && <div className="error" role="alert">{error}</div>}
    </section>

    {run && <section className="section-block">
      <div className="section-head"><div><div className="eyebrow">02 — collection</div><h2>where this rescue is.</h2></div><a className="step" href={`/track?code=${run.code}`}>public tracking page ↗</a></div>
      {tracking && <TrackingCard t={tracking}/>}
      {run.icc && <IccCard icc={run.icc}/>}
      <details className={s.log}><summary>agent log · {run.turns.length} turns · {run.metaCalls} meta call(s)</summary>
      <p className={s.meta}><span className={`status ${STATUS[run.status].tone}`}>{STATUS[run.status].label}</span><span>planner: {run.planner}</span><span>{run.metaCalls} meta call(s)</span><span>turns {run.turns.length}/{run.turnLimit}</span>{!signed && <span>run state signed with the demo key</span>}</p>
      <ol className={s.timeline}>{run.turns.map(t => <li key={t.n} className={`${s.turn} ${t.tool === "operator" ? s.operator : t.outcome === "refused" ? s.refused : t.outcome === "stopped" ? s.stopped : ""}`}>
        <div className={s.turnHead}><span className={s.turnNo}>turn {t.n}</span><span className={s.tool}>{t.tool}</span>{t.check && <span className={s.check}>refused · {t.check.replaceAll("_", " ")}</span>}</div>
        <p className={`${s.summary} keep-case`}>{t.summary}</p>
        {Object.keys(t.args).length > 0 && <details className={s.details}><summary>arguments</summary><pre className="keep-case">{JSON.stringify(t.args, null, 2)}</pre></details>}
      </li>)}</ol>
      </details>
      {run.note && <div className="empty">{run.note}</div>}

      {run.status === "needs_input" && run.question && <div className={s.panel}>
        <div className="tiny-label">question for the donor</div>
        <blockquote className="keep-case">“{run.question.text}”</blockquote>
        <div className={s.row}><label className={s.grow}>donor reply (you type it for the demo)<input className="keep-case" value={reply} onChange={e => setReply(e.target.value)} placeholder="son 15 cajas exactas, frescas, antes de las 17"/></label><button className="primary" disabled={busy || !reply.trim()} onClick={() => resume({ type: "donor_reply", text: reply })}>send reply ↗</button></div>
      </div>}

      {run.status === "awaiting_approval" && run.proposal && <div className={s.panel}>
        <div className="tiny-label">03 — proposal · passed every check</div>
        <h3>{run.proposal.recipient}</h3>
        <p className="keep-case">{run.proposal.rationale}</p>
        <p className={s.meta}><span>{run.proposal.tier}</span><span>{run.proposal.capacity}</span></p>
        <div className="evidence"><div className="tiny-label">donor quotes</div><ul className={s.quotes}>{run.proposal.quotes.map(q => <li key={q} className="keep-case">“{q}”</li>)}</ul></div>
        <p className={s.meta}><span>claims check: {run.proposal.judge.by}</span><span className="keep-case">{run.proposal.judge.note}</span></p>
        <div className={s.row}><label>reviewer<input value={reviewer} onChange={e => setReviewer(e.target.value)} maxLength={80}/></label><label className={s.grow}>notes for the agent (if you reject)<input className="keep-case" value={notes} onChange={e => setNotes(e.target.value)} maxLength={500}/></label></div>
        <div className={s.row}><button className="secondary" disabled={busy || reviewer.trim().length < 2} onClick={() => resume({ type: "decision", decision: "rejected", reviewer, notes })}>reject with notes</button><button className="primary" disabled={busy || reviewer.trim().length < 2} onClick={() => resume({ type: "decision", decision: "approved", reviewer, notes: "" })}>approve ↗</button></div>
      </div>}

      {(run.status === "escalated" || run.status === "needs_input" || run.status === "awaiting_approval") && run.supply && <div className={s.panel}>
        <div className="tiny-label">{run.status === "escalated" ? "handed to you" : "operator inspection (optional)"}</div>
        {run.handoff && <p className="keep-case">{run.handoff}</p>}
        <div className={s.row}><label>reviewer<input value={reviewer} onChange={e => setReviewer(e.target.value)} maxLength={80}/></label><label>condition after inspection<select value={inspected} onChange={e => setInspected(e.target.value as typeof inspected)}><option value="">choose…</option><option value="edible">fit for people</option><option value="past_prime">past prime</option><option value="inedible">not edible</option></select></label><label>confirmed quantity<input inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} placeholder={run.supply.quantity != null ? String(run.supply.quantity) : "e.g. 12"}/></label><label>weight checked on site (kg)<input inputMode="decimal" value={kg} onChange={e => setKg(e.target.value)} placeholder={run.icc?.physical.weightKg ? `est. ${Math.round(run.icc.physical.weightKg.value.point)}` : "e.g. 37"}/></label><button className="primary" disabled={busy || !inspected || reviewer.trim().length < 2} onClick={() => resume({ type: "inspection", condition: inspected, reviewer, ...(Number(qty) > 0 ? { quantity: Number(qty) } : {}), ...(Number(kg) > 0 ? { weightKg: Number(kg) } : {}) })}>record inspection and continue ↗</button></div>
      </div>}

      {run.status === "paused" && <div className={s.row}><button className="secondary" disabled={busy} onClick={() => resume({ type: "continue" })}>give it a few more turns</button></div>}
      {run.status === "approved" && <div className="simulated-outcome"><strong>simulated outcome</strong><p>approved by {run.review?.reviewer}. no pickup was booked and no message was sent.</p>{whatsappReply && <><div className="tiny-label" style={{ marginTop: 14 }}>whatsapp reply preview</div><p className="keep-case">{whatsappReply}</p></>}</div>}
    </section>}
  </main>;
}
