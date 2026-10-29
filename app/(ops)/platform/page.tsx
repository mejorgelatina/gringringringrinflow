"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { assessOperation, CATEGORY_LABELS, SEED_STATE, STATUS_LABELS, transitionOperation, updateOperation } from "@/lib/engines/logistics.mjs";

type Tab = "overview" | "operations" | "network" | "fleet" | "audit";
type Operation = { id:string; title:string; donor:string; item:string; category:string; quantity:number|null; unit:string; quantityConfirmed:boolean; condition:string; conditionConfirmed:boolean; pickupLocation:string; deadline:string|null; recipientId:string|null; vehicleId:string|null; status:string; source:string; evidence:string; createdAt:string; updatedAt?:string; notes:string };
type Recipient = { id:string; name:string; type:string; categories:string[]; capacity:number; area:string; conditionPolicy:string[]; receivingWindow:string; confirmed:boolean };
type Vehicle = { id:string; name:string; capacity:number; area:string; availability:string; confirmed:boolean; driver:string; temperatureControl:string };
type AuditEvent = { id:string; at:string; operationId:string|null; action:string; actor:string; detail:string };
type State = { schemaVersion:number; operations:Operation[]; recipients:Recipient[]; vehicles:Vehicle[]; audit:AuditEvent[] };
const STORE_KEY = "grinflow-logistics-state-v1";
const statusClass: Record<string,string> = { draft:"neutral", needs_review:"warn", ready_to_match:"info", proposed:"info", approved:"good", assigned:"good", picked_up:"good", delivered:"good", cancelled:"neutral" };

export default function PlatformPage() {
  const [tab,setTab] = useState<Tab>("overview");
  const [state,setState] = useState<State>(SEED_STATE as unknown as State);
  const [hydrated,setHydrated] = useState(false);
  const [selected,setSelected] = useState("GF-1024");
  const [notice,setNotice] = useState("");
  const [showNew,setShowNew] = useState(false);
  const [newTitle,setNewTitle] = useState("");
  const [newItem,setNewItem] = useState("");
  const [newCategory,setNewCategory] = useState("panificados");
  const [newQty,setNewQty] = useState("");
  const [newUnit,setNewUnit] = useState("boxes");
  const [newLocation,setNewLocation] = useState("");
  const [newCondition,setNewCondition] = useState("unknown");
  const [newDeadline,setNewDeadline] = useState("");
  const [editQuantity,setEditQuantity] = useState("");
  const [editQuantityConfirmed,setEditQuantityConfirmed] = useState(false);
  const [editCondition,setEditCondition] = useState("unknown");
  const [editConditionConfirmed,setEditConditionConfirmed] = useState(false);
  const [editLocation,setEditLocation] = useState("");
  const [editDeadline,setEditDeadline] = useState("");
  const [editCategory,setEditCategory] = useState("panificados");

  useEffect(() => {
    try { const raw = window.localStorage.getItem(STORE_KEY); if (raw) setState(JSON.parse(raw) as State); } catch { /* use seeded state */ }
    setHydrated(true);
  },[]);
  useEffect(() => { if (hydrated) { try { window.localStorage.setItem(STORE_KEY,JSON.stringify(state)); } catch { setNotice("Could not save in this browser. Export the data or avoid closing this tab."); } } },[state,hydrated]);

  const active = state.operations.find(o=>o.id===selected) || state.operations[0];
  const recipient = active ? state.recipients.find(r=>r.id===active.recipientId) : undefined;
  const vehicle = active ? state.vehicles.find(v=>v.id===active.vehicleId) : undefined;
  const assessment = active ? assessOperation(active,recipient,vehicle) : { feasible:false,blockers:["Select an operation"] };
  const metrics = useMemo(()=>({ total:state.operations.length, open:state.operations.filter(o=>!['delivered','cancelled'].includes(o.status)).length, review:state.operations.filter(o=>['draft','needs_review'].includes(o.status)).length, ready:state.operations.filter(o=>['ready_to_match','proposed','approved','assigned'].includes(o.status)).length, delivered:state.operations.filter(o=>o.status==='delivered').length }),[state]);

  useEffect(() => {
    if (!active) return;
    setEditQuantity(active.quantity == null ? "" : String(active.quantity));
    setEditQuantityConfirmed(active.quantityConfirmed);
    setEditCondition(active.condition);
    setEditConditionConfirmed(active.conditionConfirmed);
    setEditLocation(active.pickupLocation);
    setEditDeadline(active.deadline ? active.deadline.slice(0,16) : "");
    setEditCategory(active.category);
  }, [active?.id]);

  function saveCorrections(e:FormEvent) {
    e.preventDefault();
    if (!active) return;
    const quantity = editQuantity.trim() ? Number(editQuantity) : null;
    if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) { setNotice("Quantity must be a positive number or left blank."); return; }
    const patch = { quantity, quantityConfirmed: editQuantityConfirmed && quantity !== null, condition: editCondition, conditionConfirmed: editConditionConfirmed && editCondition !== "unknown", pickupLocation: editLocation.trim(), deadline: editDeadline ? new Date(editDeadline).toISOString() : null, category: editCategory };
    const result = updateOperation(state,active.id,patch);
    if (!result.ok) { setNotice(result.error || "Could not save corrections"); return; }
    setState(result.state as unknown as State); setNotice("Corrections saved to the local history. Verify the source before using this information in a real operation.");
  }

  function applyTransition(next:string) {
    if (!active) return;
    const result = transitionOperation(state,active.id,next);
    if (!result.ok) { setNotice(result.error || "Could not update"); return; }
    setState(result.state as unknown as State); setNotice(`Status updated: ${statusLabel(next)}. Local demo record; no real-world operation was executed.`);
  }
  function assignRecipient(id:string) {
    if (!active) return;
    const result = updateOperation(state,active.id,{recipientId:id || null,status:active.status === "needs_review" ? "needs_review" : active.status});
    if (!result.ok) { setNotice(result.error || "Could not save"); return; }
    setState(result.state as unknown as State); setNotice("Recipient updated. Feasibility must be checked again.");
  }
  function assignVehicle(id:string) {
    if (!active) return;
    const result = updateOperation(state,active.id,{vehicleId:id || null});
    if (!result.ok) { setNotice(result.error || "Could not save"); return; }
    setState(result.state as unknown as State); setNotice("Transport updated. Assignment does not reserve a real vehicle.");
  }
  function createOperation(e:FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newItem.trim()) { setNotice("Enter a title and product."); return; }
    const id = `GF-${1027 + state.operations.length}`;
    const op = { id,title:newTitle.trim(),donor:"Donor pending confirmation",item:newItem.trim(),category:newCategory,quantity:newQty ? Number(newQty) : null,unit:newUnit,quantityConfirmed:false,condition:newCondition,pickupLocation:newLocation.trim(),deadline:newDeadline || null,recipientId:null,vehicleId:null,status:"needs_review",source:"Manual entry in prototype",evidence:"Record created manually; original evidence still needs to be attached/verified.",createdAt:new Date().toISOString(),notes:"Synthetic local record. Confirm each field with the responsible person." };
    const at = new Date().toISOString();
    setState(s=>({...s,operations:[op,...s.operations],audit:[{id:`audit-${Date.now()}`,at,operationId:id,action:"operation_created",actor:"Demo operator",detail:"New supply offer created; flagged for human review."},...s.audit]} as unknown as State));
    setSelected(id); setTab("operations"); setShowNew(false); setNewTitle(""); setNewItem(""); setNewQty(""); setNewLocation(""); setNewDeadline(""); setNotice(`${id} created in local storage. Confirm the information before proposing a recipient.`);
  }
  function resetDemo() { setState(structuredClone(SEED_STATE) as unknown as State); setSelected("GF-1024"); setNotice("Demo reset to the original synthetic records."); }
  function exportState() { const blob = new Blob([JSON.stringify(state,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="grinflow-logistics-demo-export.json"; a.click(); URL.revokeObjectURL(url); }

  return <main className="platform-shell">
    <aside className="platform-sidebar">
      <a className="platform-brand" href="/"><span className="brand-g">g</span><span>grinflow<small>RESOURCE COORDINATION</small></span></a>
      <div className="workspace-label">WORKSPACE <span>DEMO</span></div>
      <nav className="platform-nav" aria-label="Main navigation">
        <NavButton active={tab==="overview"} onClick={()=>setTab("overview")} icon="◫" label="Overview" />
        <NavButton active={tab==="operations"} onClick={()=>setTab("operations")} icon="⇄" label="Operations" count={metrics.open} />
        <NavButton active={tab==="network"} onClick={()=>setTab("network")} icon="◎" label="Recipient network" />
        <NavButton active={tab==="fleet"} onClick={()=>setTab("fleet")} icon="↗" label="Transport" />
        <NavButton active={tab==="audit"} onClick={()=>setTab("audit")} icon="≡" label="Event history" />
      </nav>
      <div className="sidebar-bottom"><div className="online-dot"/> Local environment · synthetic data <p>No external connections or real-world actions.</p><a href="/intake">Back to intake ↗</a></div>
    </aside>
    <section className="platform-main">
      <header className="platform-topbar"><div><span className="breadcrumb">GRINFLOW / OPERATIONS</span><h1>{tabTitle(tab)}</h1></div><div className="top-actions"><span className="demo-pill">● DEMO MODE</span><button className="outline-btn" onClick={exportState}>Export JSON ↓</button><button className="solid-btn" onClick={()=>setShowNew(true)}>＋ New supply offer</button></div></header>
      <div className="platform-banner"><span className="banner-mark">!</span><div><strong>Demo environment</strong><p>Organizations, capacities, routes, and operations are synthetic. Changes are saved only in this browser. Donors, recipients, and drivers are not contacted.</p></div><button aria-label="Reset demo" title="Reset demo" onClick={resetDemo}>Reset ↻</button></div>
      {notice && <div className="platform-notice" role="status"><span>{notice}</span><button onClick={()=>setNotice("")}>×</button></div>}

      {tab==="overview" && <>
        <div className="welcome-row"><div><div className="eyebrow">OPERATIONS CONTROL CENTER</div><h2>The capacity exists.<br/><em>Let’s coordinate it better.</em></h2><p>A control center for turning fragmented messages into verifiable operations.</p></div><div className="date-chip">{new Date().toLocaleDateString("en-US",{weekday:"short",day:"2-digit",month:"short",year:"numeric"})}<small>Device-local date</small></div></div>
        <div className="metric-grid"><Metric label="Operations" value={metrics.total} hint="Records in the workspace" icon="⇄"/><Metric label="Need attention" value={metrics.review} hint="Incomplete data or pending review" icon="!" tone="warn"/><Metric label="In coordination" value={metrics.ready} hint="Simulated proposal or assignment" icon="↗"/><Metric label="Recorded deliveries" value={metrics.delivered} hint="Does not imply a real delivery in this demo" icon="✓"/></div>
        <div className="platform-grid-two"><section className="platform-card"><CardHeading eyebrow="LIVE WORK QUEUE" title="Recent operations" action="View all" onAction={()=>setTab("operations")}/><div className="queue-list">{state.operations.slice(0,5).map(op=><button key={op.id} className="queue-item" onClick={()=>{setSelected(op.id);setTab("operations")}}><span className="queue-symbol">{op.status==="needs_review"||op.status==="draft"?"!":"↗"}</span><span className="queue-main"><strong>{op.title}</strong><small>{op.id} · {op.donor}</small></span><span className={`status-pill ${statusClass[op.status]}`}>{statusLabel(op.status)}</span><span className="queue-arrow">›</span></button>)}</div></section>
        <section className="platform-card"><CardHeading eyebrow="COORDINATION HEALTH" title="Antes de proponer"/><div className="check-list"><CheckRow good={state.recipients.some(r=>r.confirmed)} title="Recipient directory" detail={`${state.recipients.filter(r=>r.confirmed).length} recipients marked as confirmed in the demo`}/><CheckRow good={state.vehicles.some(v=>v.confirmed)} title="Transport capacity" detail={`${state.vehicles.filter(v=>v.confirmed).length} units marked as available in the demo`}/><CheckRow good={state.operations.every(o=>o.evidence)} title="Source evidence" detail="Each record shows the available source; manual entries require verification."/><CheckRow good={false} title="Real integrations" detail="Not connected: WhatsApp, GPS, fleet, donors, or recipients."/></div><div className="small-callout">Feasibility is calculated using explicit rules; AI cannot bypass a blocker.</div></section></div>
        <section className="platform-card"><CardHeading eyebrow="OPERATING PRINCIPLE" title="From a message to a traceable decision"/><div className="process-steps"><ProcessStep n="01" title="Interpret" desc="Extract product, quantity, location, and time window with evidence."/><ProcessStep n="02" title="Verify" desc="Review uncertainty, condition, capacity, and constraints."/><ProcessStep n="03" title="Coordinate" desc="Compare recipients and transport; surface blockers."/><ProcessStep n="04" title="Authorize" desc="A person approves; the system records who and when."/></div></section>
      </>}

      {tab==="operations" && <div className="operations-layout"><section className="platform-card operation-list-card"><CardHeading eyebrow="OPERATIONS QUEUE" title="All operations"/><div className="operation-list">{state.operations.map(op=><button key={op.id} className={`operation-list-item ${active?.id===op.id?"selected":""}`} onClick={()=>setSelected(op.id)}><div className="operation-list-top"><span className="operation-id">{op.id}</span><span className={`status-pill ${statusClass[op.status]}`}>{statusLabel(op.status)}</span></div><strong>{op.title}</strong><small>{op.quantity == null ? "Quantity pending" : `${op.quantity} ${op.unit}`} · {op.pickupLocation||"Location pending"}</small></button>)}</div><button className="add-inline" onClick={()=>setShowNew(true)}>＋ Add supply offer</button></section>
        {active && <section className="platform-card operation-detail"><div className="detail-title-row"><div><div className="eyebrow">{active.id} · OPERATION RECORD</div><h2>{active.title}</h2><p>{active.donor}</p></div><span className={`status-pill ${statusClass[active.status]}`}>{statusLabel(active.status)}</span></div><div className="detail-section"><h3>01 / Surplus details</h3><div className="detail-facts"><DetailFact label="Product" value={`${active.item} · ${CATEGORY_LABELS[active.category] || active.category}`}/><DetailFact label="Quantity" value={active.quantity==null?"Pending":`${active.quantity} ${active.unit}${active.quantityConfirmed?" · confirmed":" · unconfirmed"}`}/><DetailFact label="Declared condition" value={conditionLabel(active.condition)}/><DetailFact label="Location" value={active.pickupLocation||"Pending"}/><DetailFact label="Deadline window" value={active.deadline?new Date(active.deadline).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"}):"Pending"}/><DetailFact label="Source" value={active.source}/></div><div className="evidence-box"><small>AVAILABLE EVIDENCE</small><p>“{active.evidence}”</p><span>Evidence alone does not prove food condition or authorization by the parties.</span></div>
          {!["approved","assigned","picked_up","delivered","cancelled"].includes(active.status) && <form className="correction-form" onSubmit={saveCorrections}><h3>Human correction and confirmation</h3><p>Confirm only information verified with an authorized source. Each save adds an event to the history.</p><div className="form-grid"><div><label className="field-label">Category</label><select className="platform-select" value={editCategory} onChange={e=>setEditCategory(e.target.value)}><option value="panificados">Bakery goods</option><option value="frutas">Fruit</option><option value="verduras">Vegetables</option><option value="lacteos">Dairy</option><option value="abarrotes">Groceries</option><option value="proteina">Protein</option><option value="organico">Organic</option></select></div><div><label className="field-label">Declared condition</label><select className="platform-select" value={editCondition} onChange={e=>setEditCondition(e.target.value)}><option value="unknown">Unknown</option><option value="edible">Declared safe/fresh (unverified)</option><option value="past_prime">Overripe / past prime</option><option value="inedible">Not suitable for human consumption</option></select></div><div><label className="field-label">Quantity</label><input className="platform-input" type="number" min="0" step="any" value={editQuantity} onChange={e=>setEditQuantity(e.target.value)} placeholder="Pending"/></div><div><label className="field-label">Location</label><input className="platform-input" value={editLocation} onChange={e=>setEditLocation(e.target.value)} placeholder="Pending"/></div><div><label className="field-label">Deadline date and time</label><input className="platform-input" type="datetime-local" value={editDeadline} onChange={e=>setEditDeadline(e.target.value)}/></div></div><label className="confirm-quantity"><input type="checkbox" checked={editQuantityConfirmed} onChange={e=>setEditQuantityConfirmed(e.target.checked)}/> I confirm that the quantity was verified with an authorized source.</label><label className="confirm-quantity"><input type="checkbox" checked={editConditionConfirmed} onChange={e=>setEditConditionConfirmed(e.target.checked)}/> I confirm that an authorized person reviewed the declared condition. This does not replace applicable food-safety protocols.</label><button className="outline-btn" type="submit">Save audited corrections</button></form>}
          </div>
          {!["approved","assigned","picked_up","delivered","cancelled"].includes(active.status) && <div className="detail-section"><h3>02 / Proposed assignment</h3><label className="field-label">Recipient</label><select className="platform-select" value={active.recipientId||""} onChange={e=>assignRecipient(e.target.value)}><option value="">No recipient selected</option>{state.recipients.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select><div className="recipient-mini">{recipient ? <><strong>{recipient.name}</strong><span>{recipient.type} · Demo capacity: {recipient.capacity} units · {recipient.receivingWindow}</span></>:<span>Select a recipient to assess compatibility.</span>}</div><label className="field-label">Transport</label><select className="platform-select" value={active.vehicleId||""} onChange={e=>assignVehicle(e.target.value)}><option value="">No transport selected</option>{state.vehicles.map(v=><option key={v.id} value={v.id}>{v.name} · {v.confirmed?"marked available":"not confirmed"}</option>)}</select><div className={`assessment-box ${assessment.feasible?"assessment-good":"assessment-blocked"}`}><strong>{assessment.feasible?"No known blockers in demo data":"Blockers to resolve"}</strong>{assessment.blockers.length>0&&<ul>{assessment.blockers.map(b=><li key={b}>{b}</li>)}</ul>}<small>This assessment does not certify food safety, real availability, consent, or the feasibility of an actual route.</small></div></div>}
          <div className="detail-section"><h3>03 / Next step</h3><p className="workflow-note">Status changes follow transition rules. Approving, assigning, picking up, or delivering only records a local simulation; no external action is triggered.</p><div className="workflow-actions">{active.status==="draft"&&<button className="outline-btn" onClick={()=>applyTransition("needs_review")}>Submit for review</button>}{["draft","needs_review"].includes(active.status)&&<button className="solid-btn" onClick={()=>applyTransition("ready_to_match")}>Mark ready for matching</button>}{active.status==="ready_to_match"&&<button className="solid-btn" onClick={()=>applyTransition("proposed")}>Record proposal</button>}{active.status==="proposed"&&<button className="solid-btn" onClick={()=>applyTransition("approved")}>Approve proposal</button>}{active.status==="approved"&&<button className="solid-btn" onClick={()=>applyTransition("assigned")}>Record transport assignment</button>}{active.status==="assigned"&&<button className="solid-btn" onClick={()=>applyTransition("picked_up")}>Record pickup</button>}{active.status==="picked_up"&&<button className="solid-btn" onClick={()=>applyTransition("delivered")}>Record delivery</button>}{!["cancelled","delivered"].includes(active.status)&&<button className="danger-outline" onClick={()=>applyTransition("cancelled")}>Cancel</button>}</div></div>
          <div className="detail-footer"><span>Creada {new Date(active.createdAt).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"})}</span><span>Persistence: this browser</span></div>
        </section>}</div>}

      {tab==="network" && <><div className="page-intro"><div className="eyebrow">RECIPIENT NETWORK</div><h2>Recipients and receiving capacity</h2><p>A demo directory that separates human consumption from material recovery. Capacities and policies are synthetic.</p></div><div className="network-grid">{state.recipients.map(r=><article className="platform-card network-card" key={r.id}><div className="network-icon">{r.type==="Material recovery"?"♻":"⌂"}</div><span className={`status-pill ${r.confirmed?"good":"warn"}`}>{r.confirmed?"Confirmed in demo":"Pending confirmation"}</span><h3>{r.name}</h3><p>{r.type}</p><div className="network-stats"><div><small>Demo capacity</small><strong>{r.capacity} units</strong></div><div><small>Area</small><strong>{r.area}</strong></div></div><div className="tag-row">{r.categories.map(c=><span key={c}>{CATEGORY_LABELS[c] || c}</span>)}</div><div className="network-foot"><span>Receiving: {r.receivingWindow}</span><span>Conditions: {r.conditionPolicy.map(conditionLabel).join(", ")}</span></div></article>)}</div><div className="platform-card integration-card"><div className="eyebrow">PRODUCTION READINESS</div><h3>What a real directory needs</h3><p>Recipient consent, accepted categories, current capacity, date-specific hours, storage requirements, an authorized contact, a data policy, and a receipt-confirmation mechanism.</p></div></>}

      {tab==="fleet" && <><div className="page-intro"><div className="eyebrow">TRANSPORT CAPACITY</div><h2>Available logistics capacity</h2><p>The platform treats transport as capacity that must be confirmed, not assumed.</p></div><div className="fleet-grid">{state.vehicles.map(v=><article className="platform-card fleet-card" key={v.id}><div className="fleet-card-top"><div className="fleet-icon">↗</div><span className={`status-pill ${v.confirmed?"good":"warn"}`}>{v.confirmed?"Confirmed in demo":"Unconfirmed"}</span></div><h3>{v.name}</h3><div className="fleet-data"><div><small>Capacity</small><strong>{v.capacity} units</strong></div><div><small>Base area</small><strong>{v.area}</strong></div><div><small>Driver</small><strong>{v.driver}</strong></div><div><small>Availability</small><strong>{v.availability}</strong></div><div><small>Temperature control</small><strong>{v.temperatureControl}</strong></div></div><p className="fleet-warning">This does not represent a real vehicle or reservation. Production requires consent, verified identity, time-window availability, per-unit capacity, and traceable assignment.</p></article>)}</div><div className="platform-card integration-card"><div className="eyebrow">FUTURE INTEGRATIONS</div><h3>From declared capacity to verifiable capacity</h3><div className="process-steps compact"><ProcessStep n="01" title="Availability" desc="Start/end window, location, and operator confirmation."/><ProcessStep n="02" title="Compatibility" desc="Volume, cargo type, equipment, and handling conditions."/><ProcessStep n="03" title="Assignment" desc="Idempotent reservation, explicit acceptance, and a fallback plan."/></div></div></>}

      {tab==="audit" && <><div className="page-intro"><div className="eyebrow">EVENT LOG</div><h2>Event history</h2><p>This history records actions in the demo session. It is not an immutable production audit log.</p></div><section className="platform-card"><div className="audit-table-head"><span>DATE & TIME</span><span>OPERATION</span><span>ACTION</span><span>ACTOR / DETAIL</span></div>{state.audit.map(ev=><div className="audit-table-row" key={ev.id}><span>{new Date(ev.at).toLocaleString("en-US",{dateStyle:"short",timeStyle:"medium"})}</span><span>{ev.operationId||"—"}</span><span><strong>{ev.action}</strong></span><span>{ev.actor}: {ev.detail}</span></div>)}</section><div className="platform-card integration-card"><h3>Production audit requirements</h3><p>Append-only server log, authenticated identity, role-based permissions, request correlation, correction versions, retention policy, personal-data protection, and verifiable exports.</p></div></>}

      <footer className="platform-footer"><span>GRINFLOW · RESOURCE COORDINATION</span><span>Prototype build · Local-first · No real-world dispatch</span></footer>
    </section>
    {showNew && <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowNew(false)}}><form className="new-operation-modal" onSubmit={createOperation}><div className="modal-head"><div><div className="eyebrow">NEW SUPPLY RECORD</div><h2>Create a supply offer</h2><p>Incomplete fields remain pending; values are never invented.</p></div><button type="button" className="close-modal" onClick={()=>setShowNew(false)} aria-label="Close">×</button></div><label className="field-label">Record title *</label><input className="platform-input" value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="e.g. Bakery surplus" required/><label className="field-label">Product *</label><input className="platform-input" value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder="e.g. assorted bread" required/><div className="form-grid"><div><label className="field-label">Category</label><select className="platform-select" value={newCategory} onChange={e=>setNewCategory(e.target.value)}><option value="panificados">Bakery goods</option><option value="frutas">Fruit</option><option value="verduras">Vegetables</option><option value="lacteos">Dairy</option><option value="abarrotes">Groceries</option><option value="proteina">Protein</option><option value="organico">Organic</option></select></div><div><label className="field-label">Declared condition</label><select className="platform-select" value={newCondition} onChange={e=>setNewCondition(e.target.value)}><option value="unknown">Unknown</option><option value="edible">Declared safe/fresh (unverified)</option><option value="past_prime">Overripe / past prime</option><option value="inedible">Not suitable for human consumption</option></select></div><div><label className="field-label">Quantity</label><input className="platform-input" type="number" min="0" step="any" value={newQty} onChange={e=>setNewQty(e.target.value)} placeholder="Pending"/></div><div><label className="field-label">Unit</label><select className="platform-select" value={newUnit} onChange={e=>setNewUnit(e.target.value)}><option>boxes</option><option>kg</option><option>pieces</option><option>pallets</option><option>bags</option></select></div></div><label className="field-label">Pickup location</label><input className="platform-input" value={newLocation} onChange={e=>setNewLocation(e.target.value)} placeholder="Neighborhood / address pending confirmation"/><label className="field-label">Deadline date and time</label><input className="platform-input" type="datetime-local" value={newDeadline} onChange={e=>setNewDeadline(e.target.value)}/><div className="modal-note">This entry does not verify the donor or certify food. Quantity remains unconfirmed until a person reviews it.</div><div className="modal-actions"><button type="button" className="outline-btn" onClick={()=>setShowNew(false)}>Cancel</button><button type="submit" className="solid-btn">Create record →</button></div></form></div>}
  </main>;
}
function statusLabel(status:string){return (STATUS_LABELS as Record<string,string>)[status] || status}
function tabTitle(tab:Tab){return ({overview:"Overview",operations:"Operations",network:"Recipient network",fleet:"Transport",audit:"Event history"})[tab]}
function NavButton({active,onClick,icon,label,count}:{active:boolean;onClick:()=>void;icon:string;label:string;count?:number}){return <button onClick={onClick} className={`platform-nav-button ${active?"active":""}`}><span className="nav-icon">{icon}</span><span>{label}</span>{count!==undefined&&count>0&&<span className="nav-count">{count}</span>}</button>}
function Metric({label,value,hint,icon,tone=""}:{label:string;value:number;hint:string;icon:string;tone?:string}){return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>}
function CardHeading({eyebrow,title,action,onAction}:{eyebrow:string;title:string;action?:string;onAction?:()=>void}){return <div className="platform-card-heading"><div><div className="eyebrow">{eyebrow}</div><h3>{title}</h3></div>{action&&<button className="text-action" onClick={onAction}>{action} →</button>}</div>}
function CheckRow({good,title,detail}:{good:boolean;title:string;detail:string}){return <div className="check-row"><span className={`check-indicator ${good?"good":"warn"}`}>{good?"✓":"!"}</span><div><strong>{title}</strong><p>{detail}</p></div></div>}
function ProcessStep({n,title,desc}:{n:string;title:string;desc:string}){return <div className="process-step"><span>{n}</span><strong>{title}</strong><p>{desc}</p></div>}
function DetailFact({label,value}:{label:string;value:string}){return <div className="detail-fact"><small>{label}</small><strong>{value}</strong></div>}
function conditionLabel(v:string){return (({edible:"Declared fresh/suitable (unverified)",past_prime:"Overripe / past prime",inedible:"Not suitable for human consumption",unknown:"Unknown"}) as Record<string,string>)[v]||v}
