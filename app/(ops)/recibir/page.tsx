"use client";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseClientAuth } from "@/lib/firebase/client";
import type { InboxItem } from "@/lib/offers/inbox";
import type { MissionItem } from "@/lib/offers/missions";
import type { Reservation } from "@/lib/network/types";
import type { PublicRegistration } from "@/lib/registry/display";
import { TeamSignIn } from "../team/sign-in";

// Inbox for receivers, makers and compost (E4): lots addressed to us, holds, delivery choice.
// Missions with their pickup codes (E5) list below the inbox.

const TIER_LABEL: Record<string, string> = { people: "personas", transformation: "transformación", compost: "composta" };
const STATUS_LABEL: Record<string, string> = {
  held: "apartado", awaiting_acceptance: "cotización por aceptar", awaiting_capacity: "esperando transporte",
  scheduled: "programado", in_transit: "en camino", delivered: "entregado", expired: "vencido",
  cancelled: "cancelado", stopped: "detenido",
};
const MODE_LABEL: Record<string, string> = { pickup: "recojo yo (gratis)", own_courier: "mi propio envío (a mi cargo)", courier: "mensajería", backhaul: "ruta compartida" };

function fmtTime(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("es-mx", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function RecibirPage() {
  const auth = firebaseClientAuth();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [reg, setReg] = useState<PublicRegistration | null>(null);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [missions, setMissions] = useState<MissionItem[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [kg, setKg] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<Record<string, string>>({});

  useEffect(() => auth ? onAuthStateChanged(auth, u => { setUser(u); setAuthReady(true); }) : undefined, [auth]);

  const load = useCallback(async () => {
    if (!user) { setReg(null); setItems(null); setMissions(null); return; }
    setError("");
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/org/me", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => null);
      if (r.status === 404 || d?.error === "no-registration") { setReg(null); setItems(null); setMissions(null); return; }
      if (!r.ok || !d?.ok) throw new Error("no se pudo cargar tu organización.");
      setReg(d.registration);
      const ri = await fetch("/api/inbox", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
      const di = await ri.json().catch(() => null);
      if (!ri.ok || !di?.ok) throw new Error("no se pudo cargar tu bandeja.");
      setItems(di.items as InboxItem[]);
      const rm = await fetch("/api/missions", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
      const dm = await rm.json().catch(() => null);
      setMissions(rm.ok && dm?.ok ? dm.missions as MissionItem[] : []);
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
  }, [user]);
  useEffect(() => { if (authReady) load(); }, [load, authReady]);

  async function act(offerId: string, path: string, body: Record<string, unknown>, key: string) {
    if (!user || busy) return;
    setBusy(key); setError("");
    try {
      const r = await fetch(`/api/offers/${offerId}/${path}`, {
        method: path === "weight" ? "PATCH" : "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) throw new Error(d?.message || d?.error || "no se pudo completar la acción.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
    finally { setBusy(""); }
  }

  const canReceive = !!reg && !reg.roles.every(r => r === "donor");

  return <div className="shell">
    <div className="topbar"><a className="wordmark" href="/"><span className="mark">g</span>grinflow</a></div>
    {!authReady && <div className="section-block"><p className="empty">cargando…</p></div>}
    {authReady && !auth && <div className="section-block"><p className="empty">recibir necesita firebase configurado (NEXT_PUBLIC_FIREBASE_*).</p></div>}
    {authReady && auth && !user && <div className="section-block">
      <div className="section-head"><h2>entra para ver tu bandeja</h2></div>
      <TeamSignIn auth={auth} user={user} onChange={load} emailPlaceholder="correo de tu organización" />
    </div>}
    {error && <div className="section-block"><p className="error" role="alert">{error}</p></div>}
    {authReady && user && !reg && <div className="section-block">
      <p className="empty">aún no registras tu organización. <a href="/cuenta">regístrala en /cuenta</a> y vuelve aquí.</p>
    </div>}
    {authReady && user && reg && !canReceive && <div className="section-block">
      <p className="empty">esta bandeja es para organizaciones que reciben. tu registro es solo donante.</p>
    </div>}
    {authReady && user && reg && canReceive && <>
      <div className="hero">
        <p className="eyebrow">bandeja de entrada</p>
        <h1>lotes para ti, <em className="keep-case">{reg.name}</em></h1>
        <p className="lede">solo ves lotes donde fuiste notificado. aparta kilos, elige cómo recibir y confirma. la dirección exacta aparece cuando tu apartado queda programado.</p>
      </div>
      {items === null && <div className="section-block"><p className="empty">cargando tu bandeja…</p></div>}
      {items !== null && items.length === 0 && <div className="section-block">
        <p className="empty">no hay lotes para ti ahora mismo. cuando un lote compatible te toque en una ola, aparecerá aquí.</p>
      </div>}
      {items?.map(item => <OfferCard key={item.offer.id} item={item} busy={busy} act={act} kg={kg} setKg={setKg} mode={mode} setMode={setMode} />)}
      <div className="section-block">
        <div className="section-head"><h2>mis misiones</h2><a className="step" href="/scan">escanear ↗</a></div>
        {missions === null && <p className="empty">cargando tus misiones…</p>}
        {missions !== null && missions.length === 0 && <p className="empty">sin misiones todavía. cuando programes un apartado, aquí aparece su qr para recoger.</p>}
        {missions?.map(m => <MissionRow key={m.mission.id} m={m} />)}
      </div>
    </>}
  </div>;
}

function OfferCard({ item, busy, act, kg, setKg, mode, setMode }: {
  item: InboxItem; busy: string;
  act: (offerId: string, path: string, body: Record<string, unknown>, key: string) => void;
  kg: Record<string, string>; setKg: (f: (p: Record<string, string>) => Record<string, string>) => void;
  mode: Record<string, string>; setMode: (f: (p: Record<string, string>) => Record<string, string>) => void;
}) {
  const o = item.offer;
  const title = o.item || o.category || "lote";
  return <div className="section-block">
    <div className="section-head"><h2 className="keep-case">{title}</h2><span className="step">{o.case?.status === "fully_reserved" ? "completo" : `${item.availableKg} kg disponibles`}</span></div>
    <p className="keep-case">de {o.donorName} · {o.condition.effective === "edible" ? "apto para consumo" : o.condition.effective === "unknown" ? "condición por confirmar" : "no apto para consumo"}{o.tier ? ` · ${TIER_LABEL[o.tier]}` : ""}</p>
    {item.myMatch
      ? <p>para ti: zona {item.myMatch.zone} · llega en ~{item.myMatch.etaMinutes} min · puedes tomar hasta {item.myMatch.maxKg} kg.</p>
      : <p className="empty">ya no eres elegible para este lote (se llenó o cambió).</p>}
    {o.location && <p className="keep-case">recolección: {o.location}.</p>}
    {item.myMatch && item.availableKg > 0 && <div className="input-foot">
      <span><input aria-label="kilos a apartar" type="number" min="0.5" step="0.5" max={item.availableKg} placeholder="kg"
        value={kg[o.id] ?? ""} onChange={e => setKg(p => ({ ...p, [o.id]: e.target.value }))} style={{ width: 80 }} /></span>
      <button className="primary" disabled={!!busy} onClick={() => act(o.id, "reserve", { kg: Number(kg[o.id]) }, `r${o.id}`)}>
        {busy === `r${o.id}` ? "apartando…" : "apartar kilos ↗"}</button>
    </div>}
    {item.mine.map(r => <ReservationRow key={r.id} offerId={o.id} r={r} item={item} busy={busy} act={act} mode={mode} setMode={setMode} />)}
  </div>;
}

function ReservationRow({ offerId, r, item, busy, act, mode, setMode }: {
  offerId: string; r: Reservation; item: InboxItem; busy: string;
  act: (offerId: string, path: string, body: Record<string, unknown>, key: string) => void;
  mode: Record<string, string>; setMode: (f: (p: Record<string, string>) => Record<string, string>) => void;
}) {
  const choices = item.choices[r.id] ?? [];
  const picked = mode[r.id] ?? choices[0]?.mode ?? "";
  const pickedQuote = choices.find(q => q.mode === picked) ?? choices[0];
  return <div>
    <p>tu apartado: {r.kg} kg · {STATUS_LABEL[r.status] ?? r.status}
      {r.status === "held" && r.holdUntil ? ` · vence ${fmtTime(r.holdUntil)}` : ""}
      {r.handoffCode ? ` · código ${r.handoffCode}` : ""}</p>
    {r.status === "held" && choices.length > 0 && <div className="input-foot">
      <span><select aria-label="forma de entrega" value={picked} onChange={e => setMode(p => ({ ...p, [r.id]: e.target.value }))}>
        {choices.map(q => <option key={q.mode + (q.vehicleId ?? "")} value={q.mode}>
          {MODE_LABEL[q.mode] ?? q.mode}{q.costMxn > 0 ? ` · $${q.costMxn}` : ""}{q.simulated ? " (simulado)" : ""}
        </option>)}
      </select></span>
      <button className="secondary" disabled={!!busy} onClick={() => act(offerId, "delivery", { reservationId: r.id, mode: picked, vehicleId: pickedQuote?.vehicleId ?? null }, `d${r.id}`)}>
        {busy === `d${r.id}` ? "eligiendo…" : "elegir entrega ↗"}</button>
    </div>}
    {r.status === "held" && choices.length === 0 && <p className="empty">sin formas de entrega viables por ahora.</p>}
    {r.status === "awaiting_acceptance" && r.quote && <div className="input-foot">
      <span>{r.quote.label} · ${r.quote.costMxn}{r.quote.simulated ? " (simulado)" : ""} · llega {fmtTime(r.quote.arrivalAt)}</span>
      <span><button className="primary" disabled={!!busy} onClick={() => act(offerId, "quote", { reservationId: r.id, action: "accept" }, `a${r.id}`)}>aceptar costo ↗</button>{" "}
        <button className="secondary" disabled={!!busy} onClick={() => act(offerId, "quote", { reservationId: r.id, action: "decline" }, `x${r.id}`)}>rechazar</button></span>
    </div>}
    {r.status === "awaiting_capacity" && <p className="empty">costo aceptado. esperando que el transportista confirme capacidad (sin transportista real, se queda aquí).</p>}
    {(r.status === "held" || r.status === "scheduled") && <p><button className="secondary" disabled={!!busy}
      onClick={() => act(offerId, "cancel", { reservationId: r.id }, `c${r.id}`)}>
      {busy === `c${r.id}` ? "liberando…" : "liberar apartado"}</button></p>}
  </div>;
}

const MISSION_LABEL: Record<string, string> = { active: "por recoger", completed: "completada", expired: "vencida" };

function MissionRow({ m }: { m: MissionItem }) {
  const title = m.item?.offer.item || m.item?.offer.category || "lote";
  return <div>
    <p><span className="keep-case">{title}</span> · {m.mission.kg} kg · {MISSION_LABEL[m.mission.status] ?? m.mission.status}
      {m.item ? <> · de <span className="keep-case">{m.item.offer.donorName}</span></> : ""}
      {" · "}recoger antes del {fmtTime(m.mission.windowEnd)}</p>
    {m.item?.offer.location && <p className="keep-case">recolección: {m.item.offer.location}.</p>}
    {m.mission.status === "active" && <p>código: <span className="keep-case">{m.mission.token}</span>. en la puerta, escanea el qr del donante o escribe este código en <a href="/scan">/scan</a> y confirma los kilos que sí llegaron.</p>}
    {m.mission.status === "completed" && <p>recibidos {m.mission.receivedKg} kg el {fmtTime(m.mission.scannedAt ? Date.parse(m.mission.scannedAt) : null)}.</p>}
    {m.mission.status === "expired" && <p className="empty">esta misión venció; el lote volvió a la cascada.</p>}
  </div>;
}
