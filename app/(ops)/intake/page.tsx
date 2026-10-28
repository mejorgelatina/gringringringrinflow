"use client";
import { useMemo, useState } from "react";

type Blocker = { code: string; label: string };
type Candidate = { recipientId: string; recipient: string; tier: "people" | "valorization"; capacity: string; routeKm?: number | null; routeSource?: string; feasible: boolean; blockers: Blocker[] };
type Event = { kind: string; item: string | null; category: string | null; quantity: number | null; unit: string | null; quantity_basis: "stated" | "estimated" | null; condition: string; deadline_hour: number | null; location: string | null; unresolved: string[]; quote: string };
type Result = { ok: boolean; provider?: string; model?: string | null; extraction?: { events: Event[]; residual_text: string; needs_review: boolean; review_reasons: string[] }; supply?: unknown; candidates?: Candidate[]; message?: string };
const EXAMPLE = "Tenemos 20 cajas de pan fresco en la colonia Roma, hay que recogerlas antes de las 6 pm.";
export default function Home() {
  const [message, setMessage] = useState(EXAMPLE);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [audit, setAudit] = useState<string[]>(["Demo iniciada · datos sintéticos · sin operaciones reales"]);
  const [error, setError] = useState("");
  const feasible = useMemo(() => result?.candidates?.filter(c => c.feasible) ?? [], [result]);
  const blocked = useMemo(() => result?.candidates?.filter(c => !c.feasible) ?? [], [result]);
  async function processMessage() {
    setBusy(true); setError(""); setResult(null); setDecision(null);
    try {
      const response = await fetch("/api/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      const data = await response.json() as Result;
      if (!response.ok || !data.ok) throw new Error(data.message || "No se pudo procesar el mensaje");
      setResult(data);
      setAudit(prev => [`${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · Mensaje interpretado con ${data.provider}`, ...prev]);
    } catch (e) { setError(e instanceof Error ? e.message : "Error inesperado"); }
    finally { setBusy(false); }
  }
  function decide(value: "approved" | "rejected") {
    setDecision(value);
    setAudit(prev => [`${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · ${value === "approved" ? "Propuesta aprobada para simulación" : "Propuesta rechazada por operador"} · no se ejecutó ninguna entrega`, ...prev]);
  }
  const firstEvent = result?.extraction?.events?.[0];
  return <main className="shell">
    <header className="topbar"><a className="wordmark" href="#top"><span className="mark">g</span> grinflow</a><div className="topmeta"><span className="dot"/> META GLOBAL AI DEVELOPER HACKATHON <a href="/platform" style={{marginLeft:12,color:"#087c62",fontWeight:700,textDecoration:"none"}}>OPEN LOGISTICS PLATFORM ↗</a></div></header>
    <section className="hero" id="top"><div className="eyebrow">COORDINATION INTELLIGENCE · DEMO V0.2</div><h1>The infrastructure<br/><em>already exists.</em></h1><p className="lede">GrinFlow turns fragmented food-surplus messages into verifiable, human-approved rescue proposals — without replacing the tools people already use.</p><div className="hero-tags"><span>01 / Interpret</span><span>02 / Validate</span><span>03 / Coordinate</span><span>04 / Human approval</span></div></section>
    <div className="warning"><span className="warning-icon">!</span><div><strong>SYNTHETIC DATA · SIMULATED OPERATIONS</strong><p>This prototype does not contact donors, recipients, drivers or WhatsApp. No food is moved and no real-world impact is claimed.</p></div></div>
    <section className="workbench">
      <div className="section-head"><div><div className="eyebrow">01 — INTAKE</div><h2>Start with the message.</h2></div><span className="step">INPUT → STRUCTURED DRAFT</span></div>
      <label htmlFor="message">Mensaje recibido (español informal)</label><textarea id="message" value={message} onChange={e => setMessage(e.target.value)} maxLength={5000} placeholder="Ej. nos quedaron cajas de pan..." />
      <div className="input-foot"><span>{message.length}/5,000 characters</span><button className="primary" onClick={processMessage} disabled={busy || !message.trim()}>{busy ? "Interpretando…" : "Interpretar mensaje ↗"}</button></div>
      {error && <div className="error">{error}</div>}
      {result && <div className="provider-note"><span className="provider-dot"/>{result.provider}{result.model ? ` · ${result.model}` : " · API de Meta no llamada"}</div>}
    </section>
    {result && <>
      <section className="section-block"><div className="section-head"><div><div className="eyebrow">02 — INTERPRETATION</div><h2>What did we actually learn?</h2></div><span className={`status ${result.extraction?.needs_review ? "review" : "ok"}`}>{result.extraction?.needs_review ? "Needs review" : "Draft extracted"}</span></div>
        {!firstEvent || firstEvent.kind === "unknown" ? <div className="empty">No se detectó un evento operacional accionable. No se creó una oferta.</div> : <div className="extraction-card"><div className="card-top"><span className="tiny-label">EXTRACTED EVENT</span><span className="event-kind">{firstEvent.kind.replaceAll("_", " ")}</span></div><h3>{firstEvent.item || firstEvent.category || "Evento sin categoría"}</h3><div className="facts"><Fact label="Cantidad" value={firstEvent.quantity == null ? "Desconocida" : `${firstEvent.quantity} ${firstEvent.unit || "unidades"}`} note={firstEvent.quantity_basis === "estimated" ? "ESTIMADA" : firstEvent.quantity_basis === "stated" ? "DECLARADA" : "SIN DATO"}/><Fact label="Condición" value={firstEvent.condition === "unknown" ? "Desconocida" : firstEvent.condition.replaceAll("_", " ")} note={firstEvent.condition === "edible" ? "DECLARADA EN MENSAJE" : "NO VERIFICADA"}/><Fact label="Hora límite" value={firstEvent.deadline_hour == null ? "Pendiente" : `${firstEvent.deadline_hour}:00`} note={firstEvent.deadline_hour == null ? "REQUIERE ACLARACIÓN" : "EXTRAÍDA DEL TEXTO"}/><Fact label="Recolección" value={firstEvent.location || "Pendiente"} note={firstEvent.location ? "DECLARADA EN MENSAJE" : "REQUIERE ACLARACIÓN"}/></div><div className="evidence"><div className="tiny-label">EVIDENCE · SOURCE QUOTE</div><blockquote>“{firstEvent.quote}”</blockquote></div>{(firstEvent.unresolved.length > 0 || result.extraction?.review_reasons?.length) && <div className="review-box"><strong>Human review required</strong><ul>{(result.extraction?.review_reasons || []).map((r,i)=><li key={`r${i}`}>{r}</li>)}{firstEvent.unresolved.map((u,i)=><li key={`u${i}`}>Dato pendiente: {u.replaceAll("_", " ")}</li>)}</ul></div>}</div>}
      </section>
      {result.candidates && result.candidates.length > 0 && <section className="section-block"><div className="section-head"><div><div className="eyebrow">03 — DETERMINISTIC COORDINATION</div><h2>Feasibility before ranking.</h2><p className="subhead">Hard constraints cannot be overridden by an AI score. Route distances shown here are synthetic demo assumptions, not live routing.</p></div><span className="step">{feasible.length} FEASIBLE · {blocked.length} BLOCKED</span></div>
        {feasible.length > 0 && <><div className="list-label">POTENTIALLY FEASIBLE · STILL REQUIRES HUMAN AUTHORIZATION</div>{feasible.map((c,i)=><div className="candidate feasible" key={`${c.recipientId}-${c.capacity}`}><div className="candidate-number">0{i+1}</div><div className="candidate-main"><strong>{c.recipient}</strong><span>{c.capacity}</span></div><span className="status ok">Feasible</span></div>)}</>}
        {blocked.length > 0 && <><div className="list-label blocked-label">BLOCKED OPTIONS · REASON TRANSPARENT</div>{blocked.slice(0,5).map((c,i)=><div className="candidate blocked" key={`${c.recipientId}-${c.capacity}`}><div className="candidate-number">—</div><div className="candidate-main"><strong>{c.recipient}</strong><span>{c.capacity}</span><ul>{c.blockers.map(b=><li key={b.code}>{b.label}</li>)}</ul></div><span className="status blocked-status">Blocked</span></div>)}</>}
        {feasible.length > 0 && <div className="approval"><div><div className="tiny-label">04 — HUMAN DECISION</div><strong>{decision ? (decision === "approved" ? "Approved for simulation" : "Proposal rejected") : "The system proposes. A person decides."}</strong><p>{decision ? "La decisión quedó en el historial local de esta sesión. No se reservó transporte ni se ejecutó una entrega." : "Approval only records an explicit demo decision. It does not execute a real-world action."}</p></div><div className="decision-buttons"><button className="secondary" onClick={() => decide("rejected")} disabled={!!decision}>Reject</button><button className="primary" onClick={() => decide("approved")} disabled={!!decision}>Approve proposal ↗</button></div></div>}
        {feasible.length === 0 && <div className="empty">No hay propuesta ejecutable. Primero resuelve los bloqueos; no se fuerza un match.</div>}
      </section>}
    </>}
    <section className="section-block audit-section"><div className="section-head"><div><div className="eyebrow">05 — AUDIT TRAIL</div><h2>Every decision leaves a trace.</h2></div><span className="step">SESSION ONLY</span></div><div className="audit-list">{audit.map((entry,i)=><div className="audit-row" key={`${entry}-${i}`}><span className="audit-dot"/><span>{entry}</span></div>)}{decision === "approved" && <div className="simulated-outcome"><strong>SIMULATED OUTCOME</strong><p>Demo state only. No pickup, delivery, kilograms rescued, emissions avoided, or beneficiaries served are being asserted.</p></div>}</div></section>
    <footer><div className="wordmark"><span className="mark">g</span> grinflow</div><p>We don’t replace existing infrastructure. We make it work together.</p><span>Prototype for Meta Global AI Developer Hackathon · v0.2</span></footer>
  </main>;
}
function Fact({ label, value, note }: { label: string; value: string; note: string }) { return <div className="fact"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
