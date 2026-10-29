"use client";
import { useMemo, useState } from "react";

type Blocker = { code: string; label: string };
type Candidate = { recipientId: string; recipient: string; tier: "people" | "valorization"; capacity: string; routeKm?: number | null; routeSource?: string; feasible: boolean; blockers: Blocker[] };
type Event = { kind: string; item: string | null; category: string | null; quantity: number | null; unit: string | null; quantity_basis: "stated" | "estimated" | null; condition: string; deadline_hour: number | null; location: string | null; unresolved: string[]; quote: string };
type PhotoAssessment = { visible_items: { item: string; category: string | null; approx_count: number | null; packaging: string | null }[]; visible_label_text: string[]; visible_issues: { issue: string; note: string }[]; visual_grade: "no_visible_issues" | "minor_visible_issues" | "severe_visible_issues" | "unclear_photo"; image_quality: "good" | "poor"; notes: string };
type Photo = { provider: string; model: string | null; assessment: PhotoAssessment; routing: { suggestedCondition: string; reasons: string[]; questionForDonor: string } };
type Result = { ok: boolean; provider?: string; model?: string | null; extraction?: { events: Event[]; residual_text: string; needs_review: boolean; review_reasons: string[] }; supply?: unknown; photo?: Photo | null; candidates?: Candidate[]; message?: string };
const GRADE_LABELS: Record<PhotoAssessment["visual_grade"], string> = { no_visible_issues: "No visible issues", minor_visible_issues: "Minor visible issues", severe_visible_issues: "Severe visible issues", unclear_photo: "Photo unclear" };

/** Downscale to ≤1024px JPEG so the request stays small and cheap. */
async function toDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}
const EXAMPLE = "Tenemos 20 cajas de pan fresco en la colonia Roma, hay que recogerlas antes de las 6 pm.";
const CATEGORY_LABELS: Record<string, string> = { panificados: "Bakery goods", frutas: "Fruit", verduras: "Vegetables", lacteos: "Dairy", abarrotes: "Groceries", proteina: "Protein", organico: "Organic" };
export default function Home() {
  const [message, setMessage] = useState(EXAMPLE);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [audit, setAudit] = useState<string[]>(["Demo started · synthetic data · no real-world operations"]);
  const [error, setError] = useState("");
  const [image, setImage] = useState<string | null>(null);
  async function pickPhoto(file: File | undefined) {
    setError("");
    if (!file) { setImage(null); return; }
    try { setImage(await toDataUrl(file)); } catch { setError("Could not read that image. Try a JPEG or PNG."); }
  }
  const feasible = useMemo(() => result?.candidates?.filter(c => c.feasible) ?? [], [result]);
  const blocked = useMemo(() => result?.candidates?.filter(c => !c.feasible) ?? [], [result]);
  async function processMessage() {
    setBusy(true); setError(""); setResult(null); setDecision(null);
    try {
      const response = await fetch("/api/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(image ? { message, image } : { message }) });
      const data = await response.json() as Result;
      if (!response.ok || !data.ok) throw new Error(data.message || "Could not process the message");
      setResult(data);
      setAudit(prev => [`${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} · Message interpreted with ${data.provider}${data.photo ? " · photo assessed" : ""}`, ...prev]);
    } catch (e) { setError(e instanceof Error ? e.message : "Unexpected error"); }
    finally { setBusy(false); }
  }
  function decide(value: "approved" | "rejected") {
    setDecision(value);
    setAudit(prev => [`${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} · ${value === "approved" ? "Proposal approved for simulation" : "Proposal rejected by operator"} · no delivery was executed`, ...prev]);
  }
  const firstEvent = result?.extraction?.events?.[0];
  return <main className="shell">
    <header className="topbar"><a className="wordmark" href="#top"><span className="mark">g</span> grinflow</a><div className="topmeta"><span className="dot"/> META GLOBAL AI DEVELOPER HACKATHON <a href="/platform" style={{marginLeft:12,color:"#087c62",fontWeight:700,textDecoration:"none"}}>OPEN LOGISTICS PLATFORM ↗</a></div></header>
    <section className="hero" id="top"><div className="eyebrow">COORDINATION INTELLIGENCE · DEMO V0.2</div><h1>The infrastructure<br/><em>already exists.</em></h1><p className="lede">GrinFlow turns fragmented food-surplus messages into verifiable, human-approved rescue proposals — without replacing the tools people already use.</p><div className="hero-tags"><span>01 / Interpret</span><span>02 / Validate</span><span>03 / Coordinate</span><span>04 / Human approval</span></div></section>
    <div className="warning"><span className="warning-icon">!</span><div><strong>SYNTHETIC DATA · SIMULATED OPERATIONS</strong><p>This prototype does not contact donors, recipients, drivers or WhatsApp. No food is moved and no real-world impact is claimed.</p></div></div>
    <section className="workbench">
      <div className="section-head"><div><div className="eyebrow">01 — INTAKE</div><h2>Start with the message.</h2></div><span className="step">INPUT → STRUCTURED DRAFT</span></div>
      <label htmlFor="message">Incoming message (informal Spanish)</label><textarea id="message" value={message} onChange={e => setMessage(e.target.value)} maxLength={5000} placeholder="Example: nos quedaron cajas de pan..." />
      <div className="photo-row"><label className="photo-pick" htmlFor="photo">{image ? "Change photo" : "+ Add a photo (optional)"}</label><input id="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => pickPhoto(e.target.files?.[0])} hidden/>{image && <><img className="photo-thumb" src={image} alt="Donor photo preview"/><button className="secondary" onClick={() => setImage(null)}>Remove</button></>}<span className="photo-hint">The agent describes what it sees. A photo never certifies food is safe.</span></div>
      <div className="input-foot"><span>{message.length}/5,000 characters</span><button className="primary" onClick={processMessage} disabled={busy || !message.trim()}>{busy ? "Interpreting…" : "Interpret message ↗"}</button></div>
      {error && <div className="error">{error}</div>}
      {result && <div className="provider-note"><span className="provider-dot"/>{result.provider}{result.model ? ` · ${result.model}` : " · Meta API not called"}</div>}
    </section>
    {result && <>
      <section className="section-block"><div className="section-head"><div><div className="eyebrow">02 — INTERPRETATION</div><h2>What did we actually learn?</h2></div><span className={`status ${result.extraction?.needs_review ? "review" : "ok"}`}>{result.extraction?.needs_review ? "Needs review" : "Draft extracted"}</span></div>
        {!firstEvent || firstEvent.kind === "unknown" ? <div className="empty">No actionable operational event was detected. No supply offer was created.</div> : <div className="extraction-card"><div className="card-top"><span className="tiny-label">EXTRACTED EVENT</span><span className="event-kind">{firstEvent.kind.replaceAll("_", " ")}</span></div><h3>{firstEvent.item || CATEGORY_LABELS[firstEvent.category || ""] || firstEvent.category || "Uncategorized event"}</h3><div className="facts"><Fact label="Quantity" value={firstEvent.quantity == null ? "Unknown" : `${firstEvent.quantity} ${firstEvent.unit || "units"}`} note={firstEvent.quantity_basis === "estimated" ? "ESTIMATED" : firstEvent.quantity_basis === "stated" ? "STATED" : "NO DATA"}/><Fact label="Condition" value={firstEvent.condition === "unknown" ? "Unknown" : firstEvent.condition.replaceAll("_", " ")} note={firstEvent.condition === "edible" ? "STATED IN MESSAGE" : "NOT VERIFIED"}/><Fact label="Deadline" value={firstEvent.deadline_hour == null ? "Pending" : `${firstEvent.deadline_hour}:00`} note={firstEvent.deadline_hour == null ? "NEEDS CLARIFICATION" : "EXTRACTED FROM TEXT"}/><Fact label="Pickup" value={firstEvent.location || "Pending"} note={firstEvent.location ? "STATED IN MESSAGE" : "NEEDS CLARIFICATION"}/></div><div className="evidence"><div className="tiny-label">EVIDENCE · SOURCE QUOTE</div><blockquote>“{firstEvent.quote}”</blockquote></div>{(firstEvent.unresolved.length > 0 || !!result.extraction?.review_reasons?.length) && <div className="review-box"><strong>Human review required</strong><ul>{(result.extraction?.review_reasons || []).map((r,i)=><li key={`r${i}`}>{r}</li>)}{firstEvent.unresolved.map((u,i)=><li key={`u${i}`}>Missing field: {u.replaceAll("_", " ")}</li>)}</ul></div>}</div>}
      </section>
      {result.photo && <PhotoCard photo={result.photo}/>}
      {result.candidates && result.candidates.length > 0 && <section className="section-block"><div className="section-head"><div><div className="eyebrow">03 — DETERMINISTIC COORDINATION</div><h2>Feasibility before ranking.</h2><p className="subhead">Hard constraints cannot be overridden by an AI score. Route distances shown here are synthetic demo assumptions, not live routing.</p></div><span className="step">{feasible.length} FEASIBLE · {blocked.length} BLOCKED</span></div>
        {feasible.length > 0 && <><div className="list-label">POTENTIALLY FEASIBLE · STILL REQUIRES HUMAN AUTHORIZATION</div>{feasible.map((c,i)=><div className="candidate feasible" key={`${c.recipientId}-${c.capacity}`}><div className="candidate-number">0{i+1}</div><div className="candidate-main"><strong>{c.recipient}</strong><span>{c.capacity}</span></div><span className="status ok">Feasible</span></div>)}</>}
        {blocked.length > 0 && <><div className="list-label blocked-label">BLOCKED OPTIONS · REASON TRANSPARENT</div>{blocked.slice(0,5).map((c,i)=><div className="candidate blocked" key={`${c.recipientId}-${c.capacity}`}><div className="candidate-number">—</div><div className="candidate-main"><strong>{c.recipient}</strong><span>{c.capacity}</span><ul>{c.blockers.map(b=><li key={b.code}>{b.label}</li>)}</ul></div><span className="status blocked-status">Blocked</span></div>)}</>}
        {feasible.length > 0 && <div className="approval"><div><div className="tiny-label">04 — HUMAN DECISION</div><strong>{decision ? (decision === "approved" ? "Approved for simulation" : "Proposal rejected") : "The system proposes. A person decides."}</strong><p>{decision ? "The decision was saved to this session’s local history. No transport was booked and no delivery was executed." : "Approval only records an explicit demo decision. It does not execute a real-world action."}</p></div><div className="decision-buttons"><button className="secondary" onClick={() => decide("rejected")} disabled={!!decision}>Reject</button><button className="primary" onClick={() => decide("approved")} disabled={!!decision}>Approve proposal ↗</button></div></div>}
        {feasible.length === 0 && <div className="empty">No executable proposal is available. Resolve the blockers first; no match is forced.</div>}
      </section>}
    </>}
    <section className="section-block audit-section"><div className="section-head"><div><div className="eyebrow">05 — AUDIT TRAIL</div><h2>Every decision leaves a trace.</h2></div><span className="step">SESSION ONLY</span></div><div className="audit-list">{audit.map((entry,i)=><div className="audit-row" key={`${entry}-${i}`}><span className="audit-dot"/><span>{entry}</span></div>)}{decision === "approved" && <div className="simulated-outcome"><strong>SIMULATED OUTCOME</strong><p>Demo state only. No pickup, delivery, kilograms rescued, emissions avoided, or beneficiaries served are being asserted.</p></div>}</div></section>
    <footer><div className="wordmark"><span className="mark">g</span> grinflow</div><p>We don’t replace existing infrastructure. We make it work together.</p><span>Prototype for Meta Global AI Developer Hackathon · v0.2</span></footer>
  </main>;
}
function PhotoCard({ photo }: { photo: Photo }) {
  const a = photo.assessment;
  const tone = a.visual_grade === "severe_visible_issues" ? "blocked-status" : a.visual_grade === "no_visible_issues" ? "ok" : "review";
  return <section className="section-block"><div className="section-head"><div><div className="eyebrow">02B — PHOTO ASSESSMENT</div><h2>What the agent can see.</h2><p className="subhead">{photo.provider}{photo.model ? ` · ${photo.model}` : " · Meta API not called"}</p></div><span className={`status ${tone}`}>{GRADE_LABELS[a.visual_grade]}</span></div>
    <div className="extraction-card">
      <div className="facts"><Fact label="Visible items" value={a.visible_items.length ? a.visible_items.map(i => `${i.approx_count ?? "?"} × ${i.item}`).join(", ") : "None identified"} note="MODEL EXTRACTED"/><Fact label="Visible issues" value={a.visible_issues.length ? a.visible_issues.map(i => i.issue.replaceAll("_", " ")).join(", ") : "None seen"} note="MODEL EXTRACTED"/><Fact label="Label text" value={a.visible_label_text.join(" · ") || "None legible"} note="COPIED FROM IMAGE"/><Fact label="Suggested condition" value={photo.routing.suggestedCondition.replaceAll("_", " ")} note="NEEDS HUMAN CONFIRMATION"/></div>
      {a.notes && <div className="evidence"><div className="tiny-label">AGENT NOTES</div><blockquote>{a.notes}</blockquote></div>}
      <div className="review-box"><strong>Next question for the donor</strong><ul><li>{photo.routing.questionForDonor}</li>{photo.routing.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
    </div></section>;
}
function Fact({ label, value, note }: { label: string; value: string; note: string }) { return <div className="fact"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
