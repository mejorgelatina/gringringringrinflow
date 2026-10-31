"use client";
import { useMemo, useState } from "react";
import { availableKg } from "@/lib/network/coordinator";
import { DEMO_NETWORK, runScenario, SCENARIOS, type ScenarioId } from "@/lib/network/demo";
import { matchResource } from "@/lib/network/match";
import { metrics, trackingStages } from "@/lib/network/outcomes";
import { TIER_LABEL, TIERS, type Participant } from "@/lib/network/types";
import { hhmm } from "@/lib/network/zones";
import s from "./network.module.css";

const NAMES = Object.fromEntries(DEMO_NETWORK.participants.map(p => [p.id, p.name]));
const ROLE: Record<string, string> = { donor: "donante", receiver: "organización", maker: "maker", compost: "composta", carrier: "transporte", operator: "operación" };
const STATUS: Record<string, string> = { held: "apartado", awaiting_acceptance: "esperando que acepte el costo", awaiting_capacity: "esperando capacidad", scheduled: "confirmado", in_transit: "en camino", delivered: "recibido", expired: "expirado", cancelled: "cancelado", stopped: "detenido · revisión humana" };
const COND: Record<string, string> = { edible: "apto", past_prime: "pasado de punto", inedible: "no comestible", unknown: "sin confirmar" };
const CASE: Record<string, string> = { open: "abierto", fully_reserved: "todo apartado", closed: "cerrado", no_destination: "sin destino viable" };

function describeEvent(type: string, d: Record<string, unknown>) {
  const map: Record<string, () => string> = {
    resource_published: () => `publicado · ${d.kg} kg · ventana ${d.window}`,
    wave_sent: () => `oleada ${d.wave} (${TIER_LABEL[d.tier as keyof typeof TIER_LABEL]}) → ${(d.to as string[]).join(", ")}`,
    tier_passed: () => `cascada: ${d.from} → ${d.to ?? "sin destino"} · ${d.remainingKg} kg`,
    reserved: () => `apartado ${d.kg} kg · vence ${d.holdUntil} · quedan ${d.remainingKg} kg`,
    pickup_scheduled: () => `recoge el receptor ${d.pickupAt} · código ${d.code}`,
    quote_presented: () => `cotización ${d.mode} $${d.costMxn} · llega ${d.arrivalAt}${d.simulated ? " · simulada" : ""}`,
    quote_accepted: () => `costo aceptado $${d.costMxn}`,
    transport_confirmed: () => `capacidad confirmada · ${d.vehicle} · código ${d.code}`,
    picked_up: () => `recolectado ${d.kg} kg con código`,
    received: () => `recibido ${d.kg} kg (${d.tier})`,
    hold_expired: () => `apartado expirado · ${d.kg} kg liberados`,
    handoff_stopped: () => `entrega detenida: ${d.reason}`,
    case_closed: () => `cerrado · ${d.deliveredKg} kg verificados`,
    cascade_exhausted: () => `sin destino viable · ${d.remainingKg} kg`,
  };
  return map[type]?.() ?? type;
}

function needLine(p: Participant) {
  const n = p.need!;
  const what = n.materials ? n.materials[0] : n.categories.join(", ");
  const specs = n.requires.length ? ` · ${n.requires.join(", ")}` : "";
  return `${what}${specs} · ${n.minKg}–${n.maxKg} kg · ${n.weeklyCapacityKg - n.usedThisWeekKg} kg libres/semana · ${n.selfPickup ? `recoge (≤${n.selfPickupMaxMinutes} min)` : "recibe en sitio"}`;
}

export default function NetworkPage() {
  const scenarios = useMemo(() => Object.fromEntries(SCENARIOS.map(id => [id, runScenario(id)])) as Record<ScenarioId, ReturnType<typeof runScenario>>, []);
  const [id, setId] = useState<ScenarioId>("pan");
  const [step, setStep] = useState(0);
  const sc = scenarios[id];
  const cur = sc.steps[Math.min(step, sc.steps.length - 1)];
  const c = cur.state;
  const matches = useMemo(() => matchResource(c.resource, DEMO_NETWORK, c.resource.kg, c.publishedAt), [c.resource, c.publishedAt]);
  const notified = new Set(c.waves.flatMap(w => w.notified));
  const messages = sc.steps.slice(0, step + 1).map(x => x.message).filter(Boolean) as NonNullable<typeof cur.message>[];
  const finals = SCENARIOS.map(x => scenarios[x].steps.at(-1)!.state);
  const m = metrics(finals);
  const pick = (x: ScenarioId) => { setId(x); setStep(0); };

  return <main className="shell">
    <header className="topbar"><a className="wordmark" href="/"><img src="/grinflow-logo.svg" alt="grinflow"/></a><div className="topmeta"><span className="dot"/> red de recursos · datos sintéticos</div></header>
    <section className="hero"><div className="eyebrow">una red, tres destinos</div><h1>el mismo agente,<br/><em>tres destinos.</em></h1><p className="lede">grinflow conecta lo que sobra con quien puede aprovecharlo: primero personas, luego transformación, luego composta. cada receptor decide si recoge gratis o paga un envío, y solo cuenta lo que se recibe y se verifica.</p></section>
    <div className="warning"><span className="warning-icon">!</span><div><strong>datos sintéticos · transporte simulado</strong><p>lugares, organizaciones, cotizaciones y horarios son inventados. no se llama a ninguna api de mensajería, whatsapp ni meta.</p></div></div>

    <section className="section-block">
      <div className={s.tabs} role="group" aria-label="escenario">{SCENARIOS.map(x => <button key={x} className={s.tab} aria-pressed={x === id} onClick={() => pick(x)}>{scenarios[x].label}<small>→ {scenarios[x].destination}</small></button>)}</div>
      <div className={s.layout}>
        <div className={s.panel}>
          <h3>pasos</h3>
          <ol className={s.steps}>{sc.steps.map((x, i) => <li key={i}><button aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)}><time>{hhmm(x.at)}</time><span>{x.title}</span></button></li>)}</ol>
          <div className={s.nav}><button className="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>← anterior</button><button className="primary" disabled={step >= sc.steps.length - 1} onClick={() => setStep(step + 1)}>siguiente →</button></div>
        </div>

        <div className={s.panel}>
          <h3>whatsapp (simulado)</h3>
          <div className={s.phone} aria-live="polite">{messages.length ? messages.map((msg, i) => <div key={i} className={`${s.bubble} ${msg.from !== "grinflow" ? s.in : ""}`}><small>{msg.from} → {msg.to}</small>{msg.text}</div>) : <span className={s.empty}>sin mensajes</span>}</div>
          <h3 style={{ marginTop: 16 }}>apartados y tracking</h3>
          {c.reservations.length === 0 && <p className="subhead">nadie ha apartado todavía.</p>}
          {c.reservations.map(r => <div key={r.id} className={s.res}>
            <div className={s.resHead}><b>{NAMES[r.participantId]}</b><span className={`${s.pill} ${r.status === "delivered" ? s.done : s.on}`}>{STATUS[r.status]}</span></div>
            <ol className={s.stages}>{trackingStages(c, r).map(st => <li key={st.key} className={st.done ? s.done : ""}>{st.label}{st.at && <time>{st.at}</time>}</li>)}</ol>
          </div>)}
        </div>

        <div className={s.panel}>
          <h3>{c.resource.title}</h3>
          <div className={s.facts}>
            <div className={s.fact}><span>disponible</span><strong>{availableKg(c)} / {c.resource.kg} kg</strong></div>
            <div className={s.fact}><span>condición</span><strong>{COND[c.resource.condition]}{c.resource.conditionConfirmed ? " ✓" : ""}</strong></div>
            <div className={s.fact}><span>estado</span><strong>{CASE[c.status]}</strong></div>
          </div>
          {TIERS.map(t => { const list = matches.filter(x => x.tier === t); const on = c.activeTier === t; const passed = c.passedTiers.includes(t); return <div key={t} className={s.tier}>
            <div className={s.tierHead}><span>{TIERS.indexOf(t) + 1} · {TIER_LABEL[t]}</span><span className={`${s.pill} ${on ? s.on : ""}`}>{on ? "activo" : passed ? "agotado" : list.some(x => x.eligible) ? "en espera" : "no aplica"}</span></div>
            {list.map(x => <div key={x.participantId} className={s.dest}><span><b>{x.name}</b>{x.eligible ? (notified.has(x.participantId) ? " · notificado" : "") : <> · <em>{x.blocks[0].message}</em></>}</span><span className={s.meta}>zona {x.zone} · {x.etaMinutes} min</span></div>)}
          </div>; })}
          <h3 style={{ marginTop: 12 }}>bitácora</h3>
          <ul className={s.log}>{c.events.map(e => <li key={e.seq}>{hhmm(e.at)} · {describeEvent(e.type, e.detail)}</li>)}</ul>
        </div>
      </div>
    </section>

    <section className="section-block">
      <div className="section-head"><div><div className="eyebrow">impacto verificado</div><h2>tres resultados, nunca sumados.</h2><p className="subhead">solo cuenta lo que el receptor confirmó. kg para personas, kg transformados y kg compostados son resultados distintos.</p></div></div>
      <div className={s.impact}>{TIERS.map(t => <div key={t} className={s.fact}><span>{TIER_LABEL[t]}</span><strong>{m.verifiedKg[t]} kg</strong></div>)}</div>
      <div className={s.ops}>
        <div className={s.fact}><span>lotes con destino</span><strong>{m.lotsWithDestination}/{m.lots}</strong></div>
        <div className={s.fact}><span>min. hasta el primer apartado</span><strong>{m.avgMinutesToFirstReservation ?? "—"}</strong></div>
        <div className={s.fact}><span>entregas completadas</span><strong>{m.delivered}/{m.reservations}</strong></div>
        <div className={s.fact}><span>apartados expirados</span><strong>{m.expired}</strong></div>
        <div className={s.fact}><span>costo logístico (pagado por receptores)</span><strong>${m.logisticsCostMxn} mxn</strong></div>
        <div className={s.fact}><span>capacidad ociosa aprovechada</span><strong>{m.idleCapacityKg} kg</strong></div>
        <div className={s.fact}><span>km de desvío añadidos</span><strong>{m.detourKm} km</strong></div>
        <div className={s.fact}><span>kg sin asignar</span><strong>{m.unallocatedKg}</strong></div>
      </div>
    </section>

    <section className="section-block">
      <div className="section-head"><div><div className="eyebrow">registro de la red</div><h2>un solo modelo de participantes.</h2><p className="subhead">{DEMO_NETWORK.area.name}: zona a ≤ {DEMO_NETWORK.area.zoneAMaxMinutes} min (recolección directa), zona b ≤ {DEMO_NETWORK.area.zoneBMaxMinutes} min (envío cotizado o ruta existente), zona c no se ofrece.</p></div></div>
      <div className={s.tableWrap}><table className={s.registry}>
        <thead><tr><th>participante</th><th>rol</th><th>zona</th><th>validado</th><th>recibe</th></tr></thead>
        <tbody>{DEMO_NETWORK.participants.map(p => <tr key={p.id}><td>{p.name}</td><td>{p.roles.map(r => ROLE[r]).join(", ")}{p.need ? ` · ${TIER_LABEL[p.need.tier]}` : ""}</td><td>{p.area}</td><td>{p.verified ? "sí" : "pendiente"}</td><td>{p.need ? needLine(p) : "—"}</td></tr>)}</tbody>
      </table></div>
      <div className={s.tableWrap} style={{ marginTop: 16 }}><table className={s.registry}>
        <thead><tr><th>capacidad logística</th><th>tipo</th><th>kg</th><th>tarifa (simulada)</th></tr></thead>
        <tbody>{DEMO_NETWORK.vehicles.map(v => <tr key={v.id}><td>{v.label}</td><td>{v.kind === "courier" ? "envío cotizado" : "ruta existente (backhaul)"}</td><td>{v.capacityKg}</td><td>${v.pricing.baseMxn} + ${v.pricing.perKmMxn}/km{v.kind === "route" ? " de desvío" : ""}</td></tr>)}</tbody>
      </table></div>
    </section>
    <footer><div className="wordmark"><img src="/grinflow-logo.svg" alt="grinflow"/></div><p>the infrastructure already exists. we’re building the intelligence layer on top.</p><span>engine: lib/network · synthetic demo</span></footer>
  </main>;
}
