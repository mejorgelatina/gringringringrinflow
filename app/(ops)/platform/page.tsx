"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { assessOperation, SEED_STATE, STATUS_LABELS, transitionOperation, updateOperation } from "@/lib/engines/logistics.mjs";

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
  const [newUnit,setNewUnit] = useState("cajas");
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
  useEffect(() => { if (hydrated) { try { window.localStorage.setItem(STORE_KEY,JSON.stringify(state)); } catch { setNotice("No se pudo guardar en este navegador. Exporta los datos o evita cerrar esta pestaña."); } } },[state,hydrated]);

  const active = state.operations.find(o=>o.id===selected) || state.operations[0];
  const recipient = active ? state.recipients.find(r=>r.id===active.recipientId) : undefined;
  const vehicle = active ? state.vehicles.find(v=>v.id===active.vehicleId) : undefined;
  const assessment = active ? assessOperation(active,recipient,vehicle) : { feasible:false,blockers:["Selecciona una operación"] };
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
    if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) { setNotice("La cantidad debe ser un número positivo o quedar vacía."); return; }
    const patch = { quantity, quantityConfirmed: editQuantityConfirmed && quantity !== null, condition: editCondition, conditionConfirmed: editConditionConfirmed && editCondition !== "unknown", pickupLocation: editLocation.trim(), deadline: editDeadline ? new Date(editDeadline).toISOString() : null, category: editCategory };
    const result = updateOperation(state,active.id,patch);
    if (!result.ok) { setNotice(result.error || "No se pudieron guardar las correcciones"); return; }
    setState(result.state as unknown as State); setNotice("Correcciones guardadas y registradas en el historial local. Verifica la fuente antes de usarlas en una operación real.");
  }

  function applyTransition(next:string) {
    if (!active) return;
    const result = transitionOperation(state,active.id,next);
    if (!result.ok) { setNotice(result.error || "No se pudo actualizar"); return; }
    setState(result.state as unknown as State); setNotice(`Estado actualizado: ${statusLabel(next)}. Registro local de demo; no se ejecutó una operación real.`);
  }
  function assignRecipient(id:string) {
    if (!active) return;
    const result = updateOperation(state,active.id,{recipientId:id || null,status:active.status === "needs_review" ? "needs_review" : active.status});
    if (!result.ok) { setNotice(result.error || "No se pudo guardar"); return; }
    setState(result.state as unknown as State); setNotice("Destino actualizado. La viabilidad debe volver a comprobarse.");
  }
  function assignVehicle(id:string) {
    if (!active) return;
    const result = updateOperation(state,active.id,{vehicleId:id || null});
    if (!result.ok) { setNotice(result.error || "No se pudo guardar"); return; }
    setState(result.state as unknown as State); setNotice("Transporte actualizado. La asignación no reserva un vehículo real.");
  }
  function createOperation(e:FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newItem.trim()) { setNotice("Completa el título y el producto."); return; }
    const id = `GF-${1027 + state.operations.length}`;
    const op = { id,title:newTitle.trim(),donor:"Donante por confirmar",item:newItem.trim(),category:newCategory,quantity:newQty ? Number(newQty) : null,unit:newUnit,quantityConfirmed:false,condition:newCondition,pickupLocation:newLocation.trim(),deadline:newDeadline || null,recipientId:null,vehicleId:null,status:"needs_review",source:"Alta manual en el prototipo",evidence:"Registro creado manualmente; falta adjuntar/verificar evidencia original.",createdAt:new Date().toISOString(),notes:"Registro local sintético. Confirma cada dato con la persona responsable." };
    const at = new Date().toISOString();
    setState(s=>({...s,operations:[op,...s.operations],audit:[{id:`audit-${Date.now()}`,at,operationId:id,action:"operation_created",actor:"Operador demo",detail:"Nueva oferta creada; marcada para revisión humana."},...s.audit]} as unknown as State));
    setSelected(id); setTab("operations"); setShowNew(false); setNewTitle(""); setNewItem(""); setNewQty(""); setNewLocation(""); setNewDeadline(""); setNotice(`${id} creada en almacenamiento local. Confirma la información antes de proponer un destino.`);
  }
  function resetDemo() { setState(structuredClone(SEED_STATE) as unknown as State); setSelected("GF-1024"); setNotice("Demo restablecida a los registros sintéticos originales."); }
  function exportState() { const blob = new Blob([JSON.stringify(state,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="grinflow-logistics-demo-export.json"; a.click(); URL.revokeObjectURL(url); }

  return <main className="platform-shell">
    <aside className="platform-sidebar">
      <a className="platform-brand" href="/"><span className="brand-g">g</span><span>grinflow<small>RESOURCE COORDINATION</small></span></a>
      <div className="workspace-label">WORKSPACE <span>DEMO</span></div>
      <nav className="platform-nav" aria-label="Navegación principal">
        <NavButton active={tab==="overview"} onClick={()=>setTab("overview")} icon="◫" label="Resumen" />
        <NavButton active={tab==="operations"} onClick={()=>setTab("operations")} icon="⇄" label="Operaciones" count={metrics.open} />
        <NavButton active={tab==="network"} onClick={()=>setTab("network")} icon="◎" label="Red de destinos" />
        <NavButton active={tab==="fleet"} onClick={()=>setTab("fleet")} icon="↗" label="Transporte" />
        <NavButton active={tab==="audit"} onClick={()=>setTab("audit")} icon="≡" label="Historial de eventos" />
      </nav>
      <div className="sidebar-bottom"><div className="online-dot"/> Entorno local · datos sintéticos <p>No hay conexiones externas ni acciones reales.</p><a href="/intake">Volver al intake ↗</a></div>
    </aside>
    <section className="platform-main">
      <header className="platform-topbar"><div><span className="breadcrumb">GRINFLOW / OPERATIONS</span><h1>{tabTitle(tab)}</h1></div><div className="top-actions"><span className="demo-pill">● DEMO MODE</span><button className="outline-btn" onClick={exportState}>Exportar JSON ↓</button><button className="solid-btn" onClick={()=>setShowNew(true)}>＋ Nueva oferta</button></div></header>
      <div className="platform-banner"><span className="banner-mark">!</span><div><strong>Entorno de demostración</strong><p>Organizaciones, capacidades, rutas y operaciones son sintéticas. Los cambios se guardan solo en este navegador. No se contacta a donantes, receptores ni conductores.</p></div><button aria-label="Restablecer demo" title="Restablecer demo" onClick={resetDemo}>Restablecer ↻</button></div>
      {notice && <div className="platform-notice" role="status"><span>{notice}</span><button onClick={()=>setNotice("")}>×</button></div>}

      {tab==="overview" && <>
        <div className="welcome-row"><div><div className="eyebrow">OPERATIONS CONTROL CENTER</div><h2>La capacidad existe.<br/><em>Coordinémosla mejor.</em></h2><p>Un punto de control para convertir mensajes dispersos en operaciones verificables.</p></div><div className="date-chip">{new Date().toLocaleDateString("es-MX",{weekday:"short",day:"2-digit",month:"short",year:"numeric"})}<small>Fecha local del dispositivo</small></div></div>
        <div className="metric-grid"><Metric label="Operaciones" value={metrics.total} hint="Registros en el workspace" icon="⇄"/><Metric label="Requieren atención" value={metrics.review} hint="Datos incompletos o por revisar" icon="!" tone="warn"/><Metric label="En coordinación" value={metrics.ready} hint="Propuesta o asignación simulada" icon="↗"/><Metric label="Entregas registradas" value={metrics.delivered} hint="En esta demo no implica entrega real" icon="✓"/></div>
        <div className="platform-grid-two"><section className="platform-card"><CardHeading eyebrow="LIVE WORK QUEUE" title="Operaciones recientes" action="Ver todas" onAction={()=>setTab("operations")}/><div className="queue-list">{state.operations.slice(0,5).map(op=><button key={op.id} className="queue-item" onClick={()=>{setSelected(op.id);setTab("operations")}}><span className="queue-symbol">{op.status==="needs_review"||op.status==="draft"?"!":"↗"}</span><span className="queue-main"><strong>{op.title}</strong><small>{op.id} · {op.donor}</small></span><span className={`status-pill ${statusClass[op.status]}`}>{statusLabel(op.status)}</span><span className="queue-arrow">›</span></button>)}</div></section>
        <section className="platform-card"><CardHeading eyebrow="COORDINATION HEALTH" title="Antes de proponer"/><div className="check-list"><CheckRow good={state.recipients.some(r=>r.confirmed)} title="Directorio de destinos" detail={`${state.recipients.filter(r=>r.confirmed).length} destinos marcados como confirmados en la demo`}/><CheckRow good={state.vehicles.some(v=>v.confirmed)} title="Capacidad de transporte" detail={`${state.vehicles.filter(v=>v.confirmed).length} unidades marcadas disponibles en la demo`}/><CheckRow good={state.operations.every(o=>o.evidence)} title="Evidencia de origen" detail="Cada registro muestra la fuente disponible; los registros manuales requieren verificación."/><CheckRow good={false} title="Integraciones reales" detail="No conectadas: WhatsApp, GPS, flota, donantes ni receptores."/></div><div className="small-callout">La viabilidad se calcula con reglas explícitas; la IA no puede saltarse un bloqueo.</div></section></div>
        <section className="platform-card"><CardHeading eyebrow="OPERATING PRINCIPLE" title="De un mensaje a una decisión trazable"/><div className="process-steps"><ProcessStep n="01" title="Interpretar" desc="Extraer producto, cantidad, ubicación y ventana de tiempo con evidencia."/><ProcessStep n="02" title="Verificar" desc="Revisar incertidumbre, condición, capacidad y restricciones."/><ProcessStep n="03" title="Coordinar" desc="Comparar destinos y transporte; mostrar los bloqueos."/><ProcessStep n="04" title="Autorizar" desc="Una persona aprueba; el sistema registra quién y cuándo."/></div></section>
      </>}

      {tab==="operations" && <div className="operations-layout"><section className="platform-card operation-list-card"><CardHeading eyebrow="OPERATIONS QUEUE" title="Todas las operaciones"/><div className="operation-list">{state.operations.map(op=><button key={op.id} className={`operation-list-item ${active?.id===op.id?"selected":""}`} onClick={()=>setSelected(op.id)}><div className="operation-list-top"><span className="operation-id">{op.id}</span><span className={`status-pill ${statusClass[op.status]}`}>{statusLabel(op.status)}</span></div><strong>{op.title}</strong><small>{op.quantity == null ? "Cantidad pendiente" : `${op.quantity} ${op.unit}`} · {op.pickupLocation||"Ubicación pendiente"}</small></button>)}</div><button className="add-inline" onClick={()=>setShowNew(true)}>＋ Registrar nueva oferta</button></section>
        {active && <section className="platform-card operation-detail"><div className="detail-title-row"><div><div className="eyebrow">{active.id} · OPERATION RECORD</div><h2>{active.title}</h2><p>{active.donor}</p></div><span className={`status-pill ${statusClass[active.status]}`}>{statusLabel(active.status)}</span></div><div className="detail-section"><h3>01 / Datos del excedente</h3><div className="detail-facts"><DetailFact label="Producto" value={`${active.item} · ${active.category}`}/><DetailFact label="Cantidad" value={active.quantity==null?"Pendiente":`${active.quantity} ${active.unit}${active.quantityConfirmed?" · confirmada":" · sin confirmar"}`}/><DetailFact label="Condición declarada" value={conditionLabel(active.condition)}/><DetailFact label="Ubicación" value={active.pickupLocation||"Pendiente"}/><DetailFact label="Ventana límite" value={active.deadline?new Date(active.deadline).toLocaleString("es-MX",{dateStyle:"medium",timeStyle:"short"}):"Pendiente"}/><DetailFact label="Fuente" value={active.source}/></div><div className="evidence-box"><small>EVIDENCIA DISPONIBLE</small><p>“{active.evidence}”</p><span>La evidencia no demuestra por sí sola la condición alimentaria ni la autorización de las partes.</span></div>
          {!["approved","assigned","picked_up","delivered","cancelled"].includes(active.status) && <form className="correction-form" onSubmit={saveCorrections}><h3>Corrección y confirmación humana</h3><p>Confirma solo datos verificados con una fuente autorizada. Cada guardado agrega un evento al historial.</p><div className="form-grid"><div><label className="field-label">Categoría</label><select className="platform-select" value={editCategory} onChange={e=>setEditCategory(e.target.value)}><option value="panificados">Panificados</option><option value="frutas">Frutas</option><option value="verduras">Verduras</option><option value="lacteos">Lácteos</option><option value="abarrotes">Abarrotes</option><option value="proteina">Proteína</option><option value="organico">Orgánico</option></select></div><div><label className="field-label">Condición declarada</label><select className="platform-select" value={editCondition} onChange={e=>setEditCondition(e.target.value)}><option value="unknown">Desconocida</option><option value="edible">Declarada apta/fresca (no verificada)</option><option value="past_prime">Muy madura / fuera de punto</option><option value="inedible">No apta para consumo humano</option></select></div><div><label className="field-label">Cantidad</label><input className="platform-input" type="number" min="0" step="any" value={editQuantity} onChange={e=>setEditQuantity(e.target.value)} placeholder="Pendiente"/></div><div><label className="field-label">Ubicación</label><input className="platform-input" value={editLocation} onChange={e=>setEditLocation(e.target.value)} placeholder="Pendiente"/></div><div><label className="field-label">Fecha y hora límite</label><input className="platform-input" type="datetime-local" value={editDeadline} onChange={e=>setEditDeadline(e.target.value)}/></div></div><label className="confirm-quantity"><input type="checkbox" checked={editQuantityConfirmed} onChange={e=>setEditQuantityConfirmed(e.target.checked)}/> Confirmo que la cantidad fue verificada con una fuente autorizada.</label><label className="confirm-quantity"><input type="checkbox" checked={editConditionConfirmed} onChange={e=>setEditConditionConfirmed(e.target.checked)}/> Confirmo que una persona autorizada revisó la condición declarada. Esto no sustituye los protocolos de inocuidad aplicables.</label><button className="outline-btn" type="submit">Guardar correcciones auditadas</button></form>}
          </div>
          {!["approved","assigned","picked_up","delivered","cancelled"].includes(active.status) && <div className="detail-section"><h3>02 / Asignación propuesta</h3><label className="field-label">Destino receptor</label><select className="platform-select" value={active.recipientId||""} onChange={e=>assignRecipient(e.target.value)}><option value="">Sin destino seleccionado</option>{state.recipients.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select><div className="recipient-mini">{recipient ? <><strong>{recipient.name}</strong><span>{recipient.type} · Capacidad de demo: {recipient.capacity} unidades · {recipient.receivingWindow}</span></>:<span>Selecciona un destino para evaluar compatibilidad.</span>}</div><label className="field-label">Transporte</label><select className="platform-select" value={active.vehicleId||""} onChange={e=>assignVehicle(e.target.value)}><option value="">Sin transporte seleccionado</option>{state.vehicles.map(v=><option key={v.id} value={v.id}>{v.name} · {v.confirmed?"marcado disponible":"no confirmado"}</option>)}</select><div className={`assessment-box ${assessment.feasible?"assessment-good":"assessment-blocked"}`}><strong>{assessment.feasible?"Sin bloqueos conocidos en los datos de demo":"Bloqueos que deben resolverse"}</strong>{assessment.blockers.length>0&&<ul>{assessment.blockers.map(b=><li key={b}>{b}</li>)}</ul>}<small>Esta evaluación no certifica inocuidad, disponibilidad real, consentimiento ni viabilidad de una ruta real.</small></div></div>}
          <div className="detail-section"><h3>03 / Siguiente paso</h3><p className="workflow-note">Los cambios de estado están sujetos a reglas de transición. Aprobar, asignar, recoger o entregar solo registra una simulación local; no dispara acciones externas.</p><div className="workflow-actions">{active.status==="draft"&&<button className="outline-btn" onClick={()=>applyTransition("needs_review")}>Enviar a revisión</button>}{["draft","needs_review"].includes(active.status)&&<button className="solid-btn" onClick={()=>applyTransition("ready_to_match")}>Marcar lista para matching</button>}{active.status==="ready_to_match"&&<button className="solid-btn" onClick={()=>applyTransition("proposed")}>Registrar propuesta</button>}{active.status==="proposed"&&<button className="solid-btn" onClick={()=>applyTransition("approved")}>Aprobar propuesta</button>}{active.status==="approved"&&<button className="solid-btn" onClick={()=>applyTransition("assigned")}>Registrar transporte asignado</button>}{active.status==="assigned"&&<button className="solid-btn" onClick={()=>applyTransition("picked_up")}>Registrar recogida</button>}{active.status==="picked_up"&&<button className="solid-btn" onClick={()=>applyTransition("delivered")}>Registrar entrega</button>}{!["cancelled","delivered"].includes(active.status)&&<button className="danger-outline" onClick={()=>applyTransition("cancelled")}>Cancelar</button>}</div></div>
          <div className="detail-footer"><span>Creada {new Date(active.createdAt).toLocaleString("es-MX",{dateStyle:"medium",timeStyle:"short"})}</span><span>Persistencia: este navegador</span></div>
        </section>}</div>}

      {tab==="network" && <><div className="page-intro"><div className="eyebrow">RECIPIENT NETWORK</div><h2>Destinos y capacidad de recepción</h2><p>Un directorio de prueba que separa consumo humano de valorización. Las capacidades y políticas son datos sintéticos.</p></div><div className="network-grid">{state.recipients.map(r=><article className="platform-card network-card" key={r.id}><div className="network-icon">{r.type==="Valorización"?"♻":"⌂"}</div><span className={`status-pill ${r.confirmed?"good":"warn"}`}>{r.confirmed?"Confirmado en demo":"Por confirmar"}</span><h3>{r.name}</h3><p>{r.type}</p><div className="network-stats"><div><small>Capacidad demo</small><strong>{r.capacity} unidades</strong></div><div><small>Zona</small><strong>{r.area}</strong></div></div><div className="tag-row">{r.categories.map(c=><span key={c}>{c}</span>)}</div><div className="network-foot"><span>Recepción: {r.receivingWindow}</span><span>Condiciones: {r.conditionPolicy.map(conditionLabel).join(", ")}</span></div></article>)}</div><div className="platform-card integration-card"><div className="eyebrow">PRODUCTION READINESS</div><h3>Qué necesita un directorio real</h3><p>Consentimiento del receptor, categorías aceptadas, capacidad actualizada, horario por fecha, requisitos de almacenamiento, contacto autorizado, política de datos y mecanismo de confirmación de recepción.</p></div></>}

      {tab==="fleet" && <><div className="page-intro"><div className="eyebrow">TRANSPORT CAPACITY</div><h2>Capacidad logística disponible</h2><p>La plataforma trata el transporte como una capacidad que debe confirmarse, no como un supuesto.</p></div><div className="fleet-grid">{state.vehicles.map(v=><article className="platform-card fleet-card" key={v.id}><div className="fleet-card-top"><div className="fleet-icon">↗</div><span className={`status-pill ${v.confirmed?"good":"warn"}`}>{v.confirmed?"Confirmado en demo":"No confirmado"}</span></div><h3>{v.name}</h3><div className="fleet-data"><div><small>Capacidad</small><strong>{v.capacity} unidades</strong></div><div><small>Zona base</small><strong>{v.area}</strong></div><div><small>Conductor</small><strong>{v.driver}</strong></div><div><small>Disponibilidad</small><strong>{v.availability}</strong></div><div><small>Control de temperatura</small><strong>{v.temperatureControl}</strong></div></div><p className="fleet-warning">No representa un vehículo real ni una reserva. Para producción se requieren consentimiento, identidad verificada, disponibilidad por intervalo, capacidad por unidad y trazabilidad de asignación.</p></article>)}</div><div className="platform-card integration-card"><div className="eyebrow">FUTURE INTEGRATIONS</div><h3>De capacidad declarada a capacidad verificable</h3><div className="process-steps compact"><ProcessStep n="01" title="Disponibilidad" desc="Ventana de inicio y fin, ubicación y confirmación del operador."/><ProcessStep n="02" title="Compatibilidad" desc="Volumen, tipo de carga, equipo y condiciones de manejo."/><ProcessStep n="03" title="Asignación" desc="Reserva idempotente, aceptación explícita y plan alternativo."/></div></div></>}

      {tab==="audit" && <><div className="page-intro"><div className="eyebrow">EVENT LOG</div><h2>Historial de eventos</h2><p>El historial documenta acciones en esta sesión de demo. No equivale a una bitácora inmutable de producción.</p></div><section className="platform-card"><div className="audit-table-head"><span>FECHA Y HORA</span><span>OPERACIÓN</span><span>ACCIÓN</span><span>ACTOR / DETALLE</span></div>{state.audit.map(ev=><div className="audit-table-row" key={ev.id}><span>{new Date(ev.at).toLocaleString("es-MX",{dateStyle:"short",timeStyle:"medium"})}</span><span>{ev.operationId||"—"}</span><span><strong>{ev.action}</strong></span><span>{ev.actor}: {ev.detail}</span></div>)}</section><div className="platform-card integration-card"><h3>Requisitos para auditoría de producción</h3><p>Registro de solo anexado en servidor, identidad autenticada, permisos por rol, correlación de solicitudes, versiones de corrección, política de retención, protección de datos personales y exportación verificable.</p></div></>}

      <footer className="platform-footer"><span>GRINFLOW · RESOURCE COORDINATION</span><span>Prototype build · Local-first · No real-world dispatch</span></footer>
    </section>
    {showNew && <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowNew(false)}}><form className="new-operation-modal" onSubmit={createOperation}><div className="modal-head"><div><div className="eyebrow">NEW SUPPLY RECORD</div><h2>Registrar una oferta</h2><p>Los campos incompletos se conservan como pendientes; no se inventan.</p></div><button type="button" className="close-modal" onClick={()=>setShowNew(false)} aria-label="Cerrar">×</button></div><label className="field-label">Título del registro *</label><input className="platform-input" value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="Ej. Excedente de panadería" required/><label className="field-label">Producto *</label><input className="platform-input" value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder="Ej. pan surtido" required/><div className="form-grid"><div><label className="field-label">Categoría</label><select className="platform-select" value={newCategory} onChange={e=>setNewCategory(e.target.value)}><option value="panificados">Panificados</option><option value="frutas">Frutas</option><option value="verduras">Verduras</option><option value="lacteos">Lácteos</option><option value="abarrotes">Abarrotes</option><option value="proteina">Proteína</option><option value="organico">Orgánico</option></select></div><div><label className="field-label">Condición declarada</label><select className="platform-select" value={newCondition} onChange={e=>setNewCondition(e.target.value)}><option value="unknown">Desconocida</option><option value="edible">Declarada apta/fresca (no verificada)</option><option value="past_prime">Muy madura / fuera de punto</option><option value="inedible">No apta para consumo humano</option></select></div><div><label className="field-label">Cantidad</label><input className="platform-input" type="number" min="0" step="any" value={newQty} onChange={e=>setNewQty(e.target.value)} placeholder="Pendiente"/></div><div><label className="field-label">Unidad</label><select className="platform-select" value={newUnit} onChange={e=>setNewUnit(e.target.value)}><option>cajas</option><option>kg</option><option>piezas</option><option>tarimas</option><option>bolsas</option></select></div></div><label className="field-label">Ubicación de recolección</label><input className="platform-input" value={newLocation} onChange={e=>setNewLocation(e.target.value)} placeholder="Colonia / dirección por confirmar"/><label className="field-label">Fecha y hora límite</label><input className="platform-input" type="datetime-local" value={newDeadline} onChange={e=>setNewDeadline(e.target.value)}/><div className="modal-note">Esta alta no valida al donante ni certifica alimentos. La cantidad queda sin confirmar hasta que una persona la revise.</div><div className="modal-actions"><button type="button" className="outline-btn" onClick={()=>setShowNew(false)}>Cancelar</button><button type="submit" className="solid-btn">Crear registro →</button></div></form></div>}
  </main>;
}
function statusLabel(status:string){return (STATUS_LABELS as Record<string,string>)[status] || status}
function tabTitle(tab:Tab){return ({overview:"Resumen",operations:"Operaciones",network:"Red de destinos",fleet:"Transporte",audit:"Historial de eventos"})[tab]}
function NavButton({active,onClick,icon,label,count}:{active:boolean;onClick:()=>void;icon:string;label:string;count?:number}){return <button onClick={onClick} className={`platform-nav-button ${active?"active":""}`}><span className="nav-icon">{icon}</span><span>{label}</span>{count!==undefined&&count>0&&<span className="nav-count">{count}</span>}</button>}
function Metric({label,value,hint,icon,tone=""}:{label:string;value:number;hint:string;icon:string;tone?:string}){return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>}
function CardHeading({eyebrow,title,action,onAction}:{eyebrow:string;title:string;action?:string;onAction?:()=>void}){return <div className="platform-card-heading"><div><div className="eyebrow">{eyebrow}</div><h3>{title}</h3></div>{action&&<button className="text-action" onClick={onAction}>{action} →</button>}</div>}
function CheckRow({good,title,detail}:{good:boolean;title:string;detail:string}){return <div className="check-row"><span className={`check-indicator ${good?"good":"warn"}`}>{good?"✓":"!"}</span><div><strong>{title}</strong><p>{detail}</p></div></div>}
function ProcessStep({n,title,desc}:{n:string;title:string;desc:string}){return <div className="process-step"><span>{n}</span><strong>{title}</strong><p>{desc}</p></div>}
function DetailFact({label,value}:{label:string;value:string}){return <div className="detail-fact"><small>{label}</small><strong>{value}</strong></div>}
function conditionLabel(v:string){return (({edible:"Declarada fresca/apta (no verificada)",past_prime:"Muy madura / fuera de punto",inedible:"No apta para consumo humano",unknown:"Desconocida"}) as Record<string,string>)[v]||v}
