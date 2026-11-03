"use client";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseClientAuth } from "@/lib/firebase/client";
import type { ImpactSummary } from "@/lib/impact/compute";
import type { ImpactFactor } from "@/lib/impact/factors";
import { TeamSignIn } from "../team/sign-in";

// Own-data impact (E7): verified kilos only, estimates from documented factors shown verbatim.
// Printable from the same data.

type Payload = { impact: ImpactSummary; factors: { co2: ImpactFactor; water: ImpactFactor } };

const TIER_LABEL: Record<string, string> = { people: "personas", transformation: "transformación", compost: "composta" };
const TIER_COLOR: Record<string, string> = { people: "#368a62", transformation: "#b98a1c", compost: "#9a4b40" };

export default function ImpactoPage() {
  const auth = firebaseClientAuth();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => auth ? onAuthStateChanged(auth, u => { setUser(u); setAuthReady(true); }) : undefined, [auth]);

  const load = useCallback(async () => {
    if (!user) { setData(null); return; }
    setError("");
    try {
      const r = await fetch("/api/impact", { cache: "no-store", headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) throw new Error("no se pudo cargar tu impacto.");
      setData({ impact: d.impact, factors: d.factors });
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
  }, [user]);
  useEffect(() => { if (authReady) load(); }, [load, authReady]);

  const impact = data?.impact ?? null;
  const empty = impact && impact.givenKg <= 0 && impact.receivedKg <= 0;

  return <div className="shell">
    <style>{`@media print { .topbar, .no-print { display: none; } .shell { max-width: none; } }`}</style>
    <div className="topbar"><a className="wordmark" href="/"><span className="mark">g</span>grinflow</a></div>
    {!authReady && <div className="section-block"><p className="empty">cargando…</p></div>}
    {authReady && !auth && <div className="section-block"><p className="empty">el impacto necesita firebase configurado (NEXT_PUBLIC_FIREBASE_*).</p></div>}
    {authReady && auth && !user && <div className="section-block">
      <div className="section-head"><h2>entra para ver tu impacto</h2></div>
      <TeamSignIn auth={auth} user={user} onChange={load} emailPlaceholder="correo de tu organización" />
    </div>}
    {error && <div className="section-block"><p className="error" role="alert">{error}</p></div>}
    {authReady && user && data && impact && <>
      <div className="hero">
        <p className="eyebrow">tu impacto</p>
        <h1>solo cuenta <em>lo verificado</em></h1>
        <p className="lede">kilos confirmados en recepción, nada estimado en el conteo. el co₂ y el agua sí son estimados, con factores documentados abajo.</p>
      </div>
      {empty && <div className="section-block">
        <p className="empty">sin entregas verificadas todavía. cuando se complete tu primera misión, tus números aparecen aquí.</p>
      </div>}
      {!empty && <>
        <div className="section-block">
          <div className="section-head"><h2>kilos verificados</h2><span className="step no-print"><button className="secondary" onClick={() => window.print()}>imprimir reporte</button></span></div>
          <p>donaste {impact.givenKg} kg en {impact.givenDeliveries} entrega(s) · recibiste {impact.receivedKg} kg en {impact.receivedDeliveries} entrega(s).</p>
          <TierBars label="donado por destino" byTier={sumTiers(impact, "given")} total={impact.givenKg} />
          <TierBars label="recibido por destino" byTier={sumTiers(impact, "received")} total={impact.receivedKg} />
          <p>{impact.divertedKg} kg desviados del relleno sanitario (transformación y composta).</p>
        </div>
        <div className="section-block">
          <div className="section-head"><h2>estimados evitados</h2></div>
          <p>~{impact.co2kg} kg de co₂e · ~{impact.waterL.toLocaleString("es-mx")} litros de agua azul.</p>
          <p className="empty">estimados sobre rescate para personas con los factores de abajo. transformación y composta no generan co₂ estimado.</p>
        </div>
      </>}
      <div className="section-block">
        <div className="section-head"><h2>factores y supuestos</h2></div>
        <FactorCard name="co₂" factor={data.factors.co2} />
        <FactorCard name="agua" factor={data.factors.water} />
      </div>
    </>}
  </div>;
}

function sumTiers(impact: ImpactSummary, side: "given" | "received"): Record<string, number> {
  return side === "given" ? impact.byTierGiven : impact.byTierReceived;
}

function TierBars({ label, byTier, total }: { label: string; byTier: Record<string, number>; total: number }) {
  if (total <= 0) return null;
  return <div>
    <p className="empty">{label}.</p>
    {(Object.keys(TIER_LABEL) as string[]).map((t) => byTier[t] > 0 && (
      <p key={t}>
        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: TIER_COLOR[t], marginRight: 8 }} />
        {TIER_LABEL[t]}: {byTier[t]} kg ({Math.round((byTier[t] / total) * 100)}%).
        <span style={{ display: "inline-block", height: 8, borderRadius: 4, background: TIER_COLOR[t], width: `${Math.max(2, Math.round((byTier[t] / total) * 200))}px`, marginLeft: 8, verticalAlign: "middle" }} />
      </p>
    ))}
  </div>;
}

function FactorCard({ name, factor }: { name: string; factor: ImpactFactor }) {
  return <div>
    <p>{name}: {factor.perKg} {factor.unit} por kilo verificado.</p>
    <p className="empty">fuente: {factor.source}</p>
    {factor.assumptions.map((a, i) => <p key={i} className="empty">supuesto: {a}</p>)}
  </div>;
}
