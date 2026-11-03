"use client";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseClientAuth } from "@/lib/firebase/client";
import { badgesFor, sectionsFor } from "@/lib/mi/home";
import { STATUS_LABEL, rolesLine } from "@/lib/registry/display";
import type { Registration } from "@/lib/registry/types";
import { TeamSignIn } from "../team/sign-in";

// Organization home (E2): greeting, verification status, real-data badges and role sections.
// Activity widgets stay empty until E3-E5 create offers, holds and missions.

export default function MiPage() {
  const auth = firebaseClientAuth();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [me, setMe] = useState<Registration | null>(null);
  const [none, setNone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => auth ? onAuthStateChanged(auth, u => { setUser(u); setAuthReady(true); }) : undefined, [auth]);

  const load = useCallback(async () => {
    if (!user) { setMe(null); setNone(false); return; }
    setError("");
    try {
      const r = await fetch("/api/org/me", { cache: "no-store", headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const d = await r.json().catch(() => null);
      if (r.status === 404 || d?.error === "no-registration") { setMe(null); setNone(true); return; }
      if (!r.ok || !d?.ok) throw new Error("no se pudo cargar tu inicio.");
      setMe(d.registration); setNone(false);
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
      {sectionsFor(me).map(sec => <div key={sec.key} className="section-block">
        <div className="section-head"><h2>{sec.title}</h2></div>
        {sec.body ? <p className="keep-case">{sec.body}</p> : <p className="empty">{sec.empty}</p>}
      </div>)}
    </>}
  </div>;
}
