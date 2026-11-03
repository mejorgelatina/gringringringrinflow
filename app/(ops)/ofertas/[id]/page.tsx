"use client";
import { use, useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseClientAuth } from "@/lib/firebase/client";
import type { NetworkEvent, Reservation } from "@/lib/network/types";
import type { Offer } from "@/lib/offers/types";
import { TeamSignIn } from "../../team/sign-in";

// Donor view of one offer (E4): holds on the lot, declare weight, stop a handoff over an anomaly.

const STATUS_LABEL: Record<string, string> = {
  held: "apartado", awaiting_acceptance: "cotización por aceptar", awaiting_capacity: "esperando transporte",
  scheduled: "programado", in_transit: "en camino", delivered: "entregado", expired: "vencido",
  cancelled: "cancelado", stopped: "detenido",
};

export default function OfertaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const auth = firebaseClientAuth();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [weight, setWeight] = useState("");
  const [reason, setReason] = useState<Record<string, string>>({});

  useEffect(() => auth ? onAuthStateChanged(auth, u => { setUser(u); setAuthReady(true); }) : undefined, [auth]);

  const load = useCallback(async () => {
    if (!user) { setOffer(null); return; }
    setError(""); setMissing(false);
    try {
      const r = await fetch(`/api/offers/${id}`, { cache: "no-store", headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const d = await r.json().catch(() => null);
      if (r.status === 404) { setMissing(true); return; }
      if (!r.ok || !d?.ok) throw new Error(d?.message || "no se pudo cargar la oferta.");
      setOffer(d.offer as Offer);
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
  }, [user, id]);
  useEffect(() => { if (authReady) load(); }, [load, authReady]);

  async function act(path: string, body: Record<string, unknown>, key: string, method = "POST") {
    if (!user || busy) return;
    setBusy(key); setError("");
    try {
      const r = await fetch(`/api/offers/${id}/${path}`, {
        method, headers: { "content-type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) throw new Error(d?.message || d?.error || "no se pudo completar la acción.");
      setOffer(d.offer as Offer);
      setWeight("");
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
    finally { setBusy(""); }
  }

  const holds = offer?.case?.reservations ?? [];
  const live = holds.filter(h => !["cancelled", "expired", "delivered"].includes(h.status));
  const events = (offer?.case?.events ?? []).slice(-12).reverse();

  return <div className="shell">
    <div className="topbar"><a className="wordmark" href="/"><span className="mark">g</span>grinflow</a></div>
    {!authReady && <div className="section-block"><p className="empty">cargando…</p></div>}
    {authReady && !auth && <div className="section-block"><p className="empty">gestionar necesita firebase configurado (NEXT_PUBLIC_FIREBASE_*).</p></div>}
    {authReady && auth && !user && <div className="section-block">
      <div className="section-head"><h2>entra para gestionar tu oferta</h2></div>
      <TeamSignIn auth={auth} user={user} onChange={load} emailPlaceholder="correo de tu organización" />
    </div>}
    {error && <div className="section-block"><p className="error" role="alert">{error}</p></div>}
    {authReady && user && missing && <div className="section-block"><p className="empty">esa oferta no existe.</p></div>}
    {authReady && user && offer && <>
      <div className="hero">
        <p className="eyebrow">gestionar oferta</p>
        <h1 className="keep-case">{offer.item || offer.category || "lote"}</h1>
        <p className="lede">{offer.case?.resource.kg ?? 0} kg · {offer.status === "open" ? "abierta" : offer.status === "needs_review" ? "en revisión" : "cerrada"} · {live.length} apartado(s) en curso · <a href="/mi">volver a /mi</a></p>
      </div>
      <div className="section-block">
        <div className="section-head"><h2>peso del lote</h2></div>
        {offer.case && offer.case.resource.kg > 0
          ? <p>{offer.case.resource.kg} kg declarados.</p>
          : <><p className="empty">sin peso declarado: nadie puede apartar hasta que lo peses.</p>
            <div className="input-foot">
              <span><input aria-label="peso en kilos" type="number" min="0.1" step="0.1" placeholder="kg" value={weight} onChange={e => setWeight(e.target.value)} style={{ width: 100 }} /></span>
              <button className="primary" disabled={!!busy || !weight} onClick={() => act("weight", { kg: Number(weight) }, "w", "PATCH")}>
                {busy === "w" ? "declarando…" : "declarar peso ↗"}</button>
            </div></>}
      </div>
      <div className="section-block">
        <div className="section-head"><h2>apartados</h2></div>
        {holds.length === 0 && <p className="empty">nadie aparta este lote todavía.</p>}
        {holds.map(h => <HoldRow key={h.id} h={h} busy={busy} act={act} reason={reason} setReason={setReason} />)}
      </div>
      <div className="section-block">
        <div className="section-head"><h2>bitácora</h2></div>
        {events.length === 0 && <p className="empty">sin eventos todavía.</p>}
        {events.map(e => <EventRow key={e.seq} e={e} />)}
      </div>
    </>}
  </div>;
}

function HoldRow({ h, busy, act, reason, setReason }: {
  h: Reservation; busy: string;
  act: (path: string, body: Record<string, unknown>, key: string, method?: string) => void;
  reason: Record<string, string>; setReason: (f: (p: Record<string, string>) => Record<string, string>) => void;
}) {
  const stoppable = h.status === "scheduled" || h.status === "in_transit";
  return <div>
    <p>{h.kg} kg · {STATUS_LABEL[h.status] ?? h.status}
      {h.quote ? ` · ${h.quote.mode === "pickup" ? "recolección" : h.quote.label}` : ""}
      {h.handoffCode ? ` · código ${h.handoffCode}` : ""}
      {h.stopReason ? ` · detenido: ${h.stopReason}` : ""}</p>
    {stoppable && <div className="input-foot">
      <span><input aria-label="motivo de la detención" placeholder="motivo (ej. llegó otra persona)" maxLength={280}
        value={reason[h.id] ?? ""} onChange={e => setReason(p => ({ ...p, [h.id]: e.target.value }))} style={{ width: 260 }} /></span>
      <button className="secondary" disabled={!!busy || !(reason[h.id] ?? "").trim()}
        onClick={() => act("stop", { reservationId: h.id, reason: reason[h.id] }, `s${h.id}`)}>
        {busy === `s${h.id}` ? "deteniendo…" : "detener entrega"}</button>
    </div>}
  </div>;
}

function EventRow({ e }: { e: NetworkEvent }) {
  return <p className="empty">{new Date(e.at).toLocaleString("es-mx", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {e.type.replaceAll("_", " ")} · {e.actor}</p>;
}
