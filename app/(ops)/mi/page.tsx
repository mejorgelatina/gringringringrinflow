"use client";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseClientAuth } from "@/lib/firebase/client";
import { badgesFor, sectionsFor } from "@/lib/mi/home";
import type { Offer } from "@/lib/offers/types";
import { STATUS_LABEL, rolesLine } from "@/lib/registry/display";
import type { PublicRegistration } from "@/lib/registry/display";
import { TeamSignIn } from "../team/sign-in";

// Organization home (E2): greeting, verification status, real-data badges and role sections.
// Donor offers list their own published lots (E3) with a manage link (E4); receiver sections link
// to the inbox with holds and missions (E4-E5).

export default function MiPage() {
  const auth = firebaseClientAuth();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [me, setMe] = useState<PublicRegistration | null>(null);
  const [none, setNone] = useState(false);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => auth ? onAuthStateChanged(auth, u => { setUser(u); setAuthReady(true); }) : undefined, [auth]);

  const load = useCallback(async () => {
    if (!user) { setMe(null); setNone(false); setOffers(null); return; }
    setError("");
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/org/me", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => null);
      if (r.status === 404 || d?.error === "no-registration") { setMe(null); setNone(true); setOffers(null); return; }
      if (!r.ok || !d?.ok) throw new Error("no se pudo cargar tu inicio.");
      setMe(d.registration); setNone(false);
      if ((d.registration as PublicRegistration).roles.includes("donor")) {
        const ro = await fetch("/api/offers", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
        const od = await ro.json().catch(() => null);
        setOffers(ro.ok && od?.ok ? od.offers as Offer[] : []);
      } else setOffers(null);
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
  }, [user]);
  useEffect(() => { if (authReady) load(); }, [load, authReady]);

  return <div className="shell">
    <div className="topbar"><a className="wordmark" href="/"><span className="mark">g</span>grinflow</a></div>
    {!authReady && <div className="section-block"><p className="empty">cargando…</p></div>}
    {authReady && !auth && <div className="section-block"><p className="empty">el inicio necesita firebase configurado (NEXT_PUBLIC_FIREBASE_*).</p></div>}
    {authReady && auth && !user && <div className="section-block">
      <div className="section-head"><h2>entra para ver tu inicio</h2></div>
      <TeamSignIn auth={auth} user={user} onChange={load} emailPlaceholder="correo de tu organización" />
    </div>}
    {error && <div className="section-block"><p className="error">{error}</p></div>}
    {authReady && user && none && !me && <div className="section-block">
      <p className="empty">aún no registras tu organización. <a href="/cuenta">regístrala en /cuenta</a> y vuelve aquí.</p>
    </div>}
    {authReady && user && me && <>
      <div className="hero">
        <p className="eyebrow">mi grinflow</p>
        <h1>hola, <em className="keep-case">{me.name}</em></h1>
        <p className="lede">{rolesLine(me.roles)} · miembro desde {me.createdAt.slice(0, 10)}</p>
        <div className="hero-tags"><span>{STATUS_LABEL[me.status]}</span>{badgesFor(me).map(b => <span key={b.id}>{b.label} · {b.detail}</span>)}</div>
      </div>
      {sectionsFor(me).map(sec => sec.key === "offers" && offers && offers.length > 0 ? <div key={sec.key} className="section-block">
        <div className="section-head"><h2>{sec.title}</h2><a className="step" href="/publicar">publicar otra ↗</a></div>
        {offers.map(o => <p key={o.id}>
          <span className="keep-case">{o.item || o.category || "lote"}</span>
          {" · "}{o.status === "open" ? "abierta" : o.status === "needs_review" ? "en revisión" : "cerrada"}
          {o.tier ? ` · tier ${o.tier}` : ""} · {o.eligible.length} destino(s)
          {o.agentCode && <> · <a href={`/track?code=${o.agentCode}`}>{o.agentCode} ↗</a></>}
          <> · <a href={`/ofertas/${o.id}`}>gestionar ↗</a></>
        </p>)}
      </div> : <div key={sec.key} className="section-block">
        <div className="section-head"><h2>{sec.title}</h2>{sec.key === "offers" && <a className="step" href="/publicar">publicar oferta ↗</a>}</div>
        {["inbox", "material-offers", "incoming"].includes(sec.key) && <p><a href="/recibir">abrir bandeja /recibir ↗</a></p>}
        {sec.body ? <p className="keep-case">{sec.body}</p> : <p className="empty">{sec.empty}</p>}
      </div>)}
    </>}
  </div>;
}
