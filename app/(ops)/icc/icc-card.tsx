import type { Assessed, IccRecord, Range } from "@/lib/icc/types";
import s from "./icc.module.css";

// One view of an ICC record, shared by /agent, /intake, /whatsapp and /network. Every value shows how it
// is known (declarado, estimado, medido, verificado), so an estimate never reads as a measurement.

const fmt = (r: Range, digits = 0) => {
  const f = (n: number) => (digits ? n.toFixed(digits) : String(Math.round(n * 10) / 10));
  return r.min === r.max ? f(r.min) : `${f(r.min)}–${f(r.max)}`;
};
const COND: Record<string, string> = { edible: "apto (declarado)", past_prime: "pasado de punto", inedible: "no comestible", unknown: "sin confirmar" };
const DEST: Record<string, string> = { people: "personas", transformation: "transformación", compost: "composta" };
const STATUS: Record<string, string> = { elegible: "elegible", condicionado: "condicionado", no_elegible: "no elegible" };
const FIELD: Record<string, string> = { quantity: "cantidad", weight: "peso", category: "categoría", location: "lugar de recolección", deadline_hour: "hora límite", condition: "condición", storage: "almacenamiento", material_specs: "especificaciones del material" };

function Value<T>({ label, a, show }: { label: string; a: Assessed<T> | null; show: (v: T) => string }) {
  return <div className={s.row}>
    <span>{label}</span>
    {a ? <span className={s.val}><span className="keep-case">{show(a.value)}</span><span className={`${s.chip} ${s[a.provenance]}`}>{a.provenance}</span></span> : <span className={s.val}>desconocido</span>}
  </div>;
}

function Method<T>({ a }: { a: Assessed<T> | null }) {
  if (!a) return null;
  return <span className={`${s.method} keep-case`}>{a.method}{a.model ? ` · ${a.model}` : ""}{a.validatedBy ? ` · ${a.validatedBy}` : ""} · confianza {a.confidence}</span>;
}

export function IccCard({ icc, title = "icc · índice de calidad compuesto" }: { icc: IccRecord; title?: string }) {
  const p = icc.physical, q = icc.quality, r = icc.risk;
  const tookMs = Date.parse(icc.structuredAt) - Date.parse(icc.receivedAt);
  return <div className={s.card}>
    <div className={s.head}><h3>{title}</h3><span className={s.meta}>{icc.spec} · canal {icc.channel}{Number.isFinite(tookMs) && tookMs >= 0 ? ` · estructurado en ${(tookMs / 1000).toFixed(1)} s` : ""}</span></div>
    <div className={s.dims}>
      <div className={s.dim}><h4>producto</h4>
        <div className={s.row}><span>qué es</span><span className={`${s.val} keep-case`}>{icc.product.item ?? "—"}</span></div>
        <div className={s.row}><span>categoría</span><span className={s.val}>{icc.product.category ?? "pendiente"}</span></div>
        <Value label="empaque" a={icc.product.packaging} show={v => v}/>
      </div>
      <div className={s.dim}><h4>calidad</h4>
        <Value label="condición" a={q.condition} show={v => COND[v] ?? v}/><Method a={q.condition}/>
        <Value label="foto" a={q.visual} show={v => v}/>
        <Value label="almacenamiento" a={q.storage} show={v => v}/>
        <div className={s.row}><span>vida útil</span><span className={s.val}>sin estimar</span></div>
      </div>
      <div className={s.dim}><h4>físico</h4>
        <Value label="conteo" a={p.count} show={v => `${v.count} ${v.unit}`}/>
        <Value label="peso" a={p.weightKg} show={v => `${p.weightKg?.provenance === "estimado" ? "~" : ""}${fmt(v)} kg`}/><Method a={p.weightKg}/>
        <Value label="volumen" a={p.volumeM3} show={v => `~${fmt(v, 2)} m³`}/>
      </div>
      <div className={s.dim}><h4>riesgo</h4>
        {r.flags.length ? <ul className={`${s.list} keep-case`}>{r.flags.map(f => <li key={f.code}>{f.label}</li>)}</ul> : <p className={s.method}>sin alertas registradas</p>}
        {r.pendingVerifications.length > 0 && <><p className={s.label} style={{ marginTop: 8 }}>por verificar</p><ul className={s.list}>{r.pendingVerifications.map(v => <li key={v}>{v}</li>)}</ul></>}
      </div>
    </div>
    {icc.missing.length > 0 && <div><p className={s.label}>falta · lo que el agente puede preguntar</p><ul className={`${s.list} keep-case`}>{icc.missing.map(m => <li key={m.field}><strong>{FIELD[m.field] ?? m.field}</strong> ({m.askWho === "donor" ? "donante" : "operador"}): {m.why}</li>)}</ul></div>}
    <div><p className={s.label}>elegibilidad preliminar por destino · el motor de red decide con capacidad, zona y horario</p>
      <div className={s.elig}>{(["people", "transformation", "compost"] as const).map(t => { const e = icc.eligibility[t]; return <div key={t} className={`${s.dest} ${s[e.status]}`}><strong>{DEST[t]}<span>{STATUS[e.status]}</span></strong><span className="keep-case">{e.reasons.join("; ")}{e.needs.length ? ` · necesita: ${e.needs.join("; ")}` : ""}</span></div>; })}</div>
    </div>
    <p className={s.score}>índice compuesto: {icc.composite.score ?? "sin puntaje"} · {icc.composite.reason}</p>
  </div>;
}
