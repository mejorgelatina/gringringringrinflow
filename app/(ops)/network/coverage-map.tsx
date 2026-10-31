"use client";
import { useMemo, useState } from "react";
import { coverage } from "@/lib/network/coverage";
import { at, DEMO_NETWORK } from "@/lib/network/demo";
import { TIER_LABEL, type Network, type Tier } from "@/lib/network/types";
import s from "./network.module.css";

// Impact zones (discovery radius around each generator) over the pilot area, and the coverage they produce.
// The radius slider is a what-if: the same matching engine re-runs for every regular stream.

const W = 640, H = 600;
const B = { minLat: 19.345, maxLat: 19.505, minLng: -99.24, maxLng: -99.07 };
const KM_LAT = 111.32, KM_LNG = 111.32 * Math.cos((19.42 * Math.PI) / 180);
const x = (lng: number) => ((lng - B.minLng) / (B.maxLng - B.minLng)) * W;
const y = (lat: number) => H - ((lat - B.minLat) / (B.maxLat - B.minLat)) * H;
const pxPerKm = W / ((B.maxLng - B.minLng) * KM_LNG);
const TIER_COLOR: Record<Tier, string> = { people: "var(--gf-green-600)", transformation: "#b7791f", compost: "#7a5a3a" };

export function CoverageMap() {
  const [radius, setRadius] = useState(5);
  const network: Network = useMemo(() => ({ ...DEMO_NETWORK, participants: DEMO_NETWORK.participants.map(p => (p.generator ? { ...p, generator: { ...p.generator, impactRadiusKm: radius } } : p)) }), [radius]);
  const cov = useMemo(() => coverage(network, at("00:00")), [network]);
  const [focus, setFocus] = useState<string | null>(null);
  const generators = network.participants.filter(p => p.generator);
  const destinations = network.participants.filter(p => p.need);
  const focused = cov.generators.find(g => g.id === focus);

  return <div className={s.coverage}>
    <div className={s.panel}>
      <svg viewBox={`0 0 ${W} ${H}`} className={s.map} role="img" aria-label="mapa de zonas de impacto (esquemático)">
        <rect x="0" y="0" width={W} height={H} fill="var(--gf-surface-sunken)" rx="12"/>
        {generators.map(g => <circle key={g.id} cx={x(g.location.lng)} cy={y(g.location.lat)} r={radius * pxPerKm} fill="var(--gf-green-200)" fillOpacity={focus && focus !== g.id ? 0.08 : 0.22} stroke="var(--gf-green-600)" strokeOpacity={focus === g.id ? 0.9 : 0.35} strokeDasharray="4 4"/>)}
        {destinations.map(d => { const dim = focused && !focused.discovered.includes(d.id); return <g key={d.id} opacity={dim ? 0.25 : 1}>
          <circle cx={x(d.location.lng)} cy={y(d.location.lat)} r="7" fill={TIER_COLOR[d.need!.tier]} stroke="white" strokeWidth="2"/>
          {focused && !dim && <text x={x(d.location.lng) + 10} y={y(d.location.lat) + 4} fontSize="11" fill="var(--gf-ink-soft)">{d.name}</text>}
        </g>; })}
        {generators.map(g => <g key={g.id} onMouseEnter={() => setFocus(g.id)} onMouseLeave={() => setFocus(null)} style={{ cursor: "pointer" }}>
          <rect x={x(g.location.lng) - 7} y={y(g.location.lat) - 7} width="14" height="14" rx="3" fill="var(--gf-ink)" stroke="white" strokeWidth="2"/>
          <text x={x(g.location.lng) + 10} y={y(g.location.lat) - 8} fontSize="12" fontWeight="700" fill="var(--gf-ink)">{g.name}</text>
        </g>)}
      </svg>
      <div className={s.legend}><span><i className={s.sq}/>generador</span>{(Object.keys(TIER_COLOR) as Tier[]).map(t => <span key={t}><i style={{ background: TIER_COLOR[t] }}/>{TIER_LABEL[t]}</span>)}<span>círculo = zona de impacto · pasa el cursor por un generador</span></div>
      <label className={s.slider}>radio de la zona de impacto: <b>{radius} km</b><input type="range" min={2} max={9} step={1} value={radius} onChange={e => setRadius(Number(e.target.value))}/></label>
      <p className="subhead">esquemático, no a escala de calles. el radio descubre participantes; si se puede hacer el match lo deciden el eta, las ventanas, la capacidad y la logística.</p>
    </div>
    <div className={s.panel}>
      <div className={s.facts}>
        <div className={s.fact}><span>cobertura de la red</span><strong>{cov.pct}%</strong></div>
        <div className={s.fact}><span>kg/semana con ruta viable</span><strong>{cov.coveredKgPerWeek} / {cov.totalKgPerWeek}</strong></div>
        <div className={s.fact}><span>personas · transf. · composta</span><strong>{cov.byTier.people} · {cov.byTier.transformation} · {cov.byTier.compost}</strong></div>
      </div>
      <ul className={s.streams}>{cov.streams.map(st => <li key={`${st.generatorId}:${st.stream.id}`} onMouseEnter={() => setFocus(st.generatorId)} onMouseLeave={() => setFocus(null)}>
        <div><b>{st.generator}</b> · {st.stream.item} <span className={s.meta}>{st.stream.kgPerWeek} kg/sem · {st.stream.frequency}</span></div>
        {st.tier ? <div className={s.ok}>→ {TIER_LABEL[st.tier]}: {st.destinations.join(", ")}</div> : <div className={s.gap}>sin ruta viable · {st.reason}</div>}
      </li>)}</ul>
    </div>
  </div>;
}
