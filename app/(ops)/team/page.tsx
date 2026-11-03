"use client";
import { useCallback, useEffect, useState } from "react";
import type { InboxItem, Registration } from "@/lib/registry/types";
import { hoursLabel } from "@/lib/registry/parse";
import { acceptsCore, rolesLine } from "@/lib/registry/display";
import { PLACES } from "@/lib/network/supply";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseClientAuth } from "@/lib/firebase/client";
import { TeamSignIn } from "./sign-in";
import s from "./team.module.css";

// The grinflow team's view: who registered through whatsapp, what is arriving, and the one decision that
// is theirs — verify an organization before it enters the network. Contact data needs the operator key.

const STATUS: Record<string, string> = { pending: "pendiente", verified: "verificado", rejected: "rechazado" };
const KIND: Record<string, string> = { offer: "oferta", need: "necesidad", registration: "registro", message: "mensaje" };
const KEY = "grinflow-operator-key";

type Data = { authorized: boolean; operatorKeySet: boolean; firebaseAuth: boolean; teamEmailsSet: boolean; signedInAs: string | null; denied: string | null; store: string; storeError?: string | null; registrations: Registration[]; inbox: InboxItem[] };

const DENIED: Record<string, string> = {
  "email-not-verified": "tu correo todavía no está verificado. abre el enlace que te mandamos y luego toca \"ya verifiqué\".",
  "not-on-team": "tu cuenta existe pero no está en el equipo. pide que agreguen tu correo a GRINFLOW_TEAM_EMAILS.",
  "invalid-token": "tu sesión expiró. vuelve a entrar.",
  "auth-not-configured": "el servidor no tiene el id del proyecto de firebase (FIREBASE_PROJECT_ID o NEXT_PUBLIC_FIREBASE_PROJECT_ID).",
};

export default function TeamPage() {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const auth = firebaseClientAuth();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!auth);

  useEffect(() => auth ? onAuthStateChanged(auth, u => { setUser(u); setAuthReady(true); }) : undefined, [auth]);

  // A signed-in Firebase user sends a fresh ID token; otherwise the operator key, if typed.
  const headers = useCallback(async (k = key): Promise<Record<string, string>> => {
    if (user) return { Authorization: `Bearer ${await user.getIdToken()}` };
    return k ? { "x-operator-key": k } : {};
  }, [user, key]);

  useEffect(() => { try { setKey(sessionStorage.getItem(KEY) ?? ""); setName(sessionStorage.getItem(`${KEY}-name`) ?? ""); } catch { /* private mode */ } }, []);

  const load = useCallback(async (k = key) => {
    setError("");
    try {
      const r = await fetch("/api/registry", { cache: "no-store", headers: await headers(k) });
      const d = await r.json().catch(() => ({ ok: false, message: `el servidor respondió ${r.status} sin datos` }));
      if (!r.ok || !d.ok) throw new Error(d.message || "no se pudo cargar");
      setData(d);
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
  }, [headers]);
  useEffect(() => { if (!authReady) return; load(); const t = setInterval(() => load(), 15000); return () => clearInterval(t); }, [load, authReady]);

  function saveKey(k: string) { setKey(k); try { sessionStorage.setItem(KEY, k); } catch { /* ignore */ } load(k); }
  function saveName(n: string) { setName(n); try { sessionStorage.setItem(`${KEY}-name`, n); } catch { /* ignore */ } }

  async function act(body: Record<string, unknown>) {
    setBusy(String(body.id)); setError("");
    try {
      const r = await fetch("/api/registry", { method: "POST", headers: { "Content-Type": "application/json", ...(await headers()) }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({ ok: false, message: `el servidor respondió ${r.status} sin datos` }));
      if (!r.ok || !d.ok) throw new Error(d.message || "no se pudo guardar");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
    finally { setBusy(null); }
  }

  const who = user?.email ?? (name.trim() || "equipo grinflow");
  const regs = data?.registrations ?? [];
  const pending = regs.filter(r => r.status === "pending");
  const others = regs.filter(r => r.status !== "pending");

  return <main className="shell">
    <section className="hero"><div className="eyebrow">equipo grinflow</div><h1>quién llega,<br/><em>quién entra.</em></h1><p className="lede">las organizaciones se registran solas por whatsapp. una persona del equipo las verifica antes de que entren a la red y reciban ofertas. aquí también llega lo que se ofrece y se pide en tiempo real.</p></section>

    <section className="section-block">
      {auth && <TeamSignIn auth={auth} user={user} onChange={() => load()}/>}
      {data?.signedInAs && <p className={s.note}>dentro como <span className="keep-case">{data.signedInAs}</span>. verificas con tu correo.</p>}
      {user && data?.denied && DENIED[data.denied] && <p className={s.note} role="status">{DENIED[data.denied]}</p>}
      {!user && <details className={s.fallback} open={!auth}>
        <summary>{auth ? "o entra con la llave de operador" : "llave de operador"}</summary>
        <div className={s.bar}>
          <input type="password" placeholder="llave de operador (OPERATOR_KEY)" value={key} onChange={e => setKey(e.target.value)} onBlur={e => saveKey(e.target.value)} aria-label="llave de operador"/>
          <input placeholder="tu nombre (queda en la verificación)" value={name} onChange={e => saveName(e.target.value)} aria-label="tu nombre"/>
          <button className="secondary" onClick={() => saveKey(key)}>actualizar</button>
        </div>
      </details>}
      {data && !data.authorized && !user && <p className={s.note}>{auth ? "sin entrar solo ves registros del simulador. los datos de contacto reales son solo para el equipo." : data.operatorKeySet ? "sin la llave solo ves registros del simulador. los datos de contacto reales necesitan la llave de operador." : "OPERATOR_KEY no está configurada: solo se muestran registros del simulador. configúrala en vercel para ver los reales."}</p>}
      {data && <p className={s.note}>almacén: {data.store === "firestore" ? "firestore (durable)" : "memoria del servidor (se pierde al reiniciar; configura firebase para conservarlo)"}</p>}
      {data?.storeError && <p className={s.note} role="status">firebase no respondió, así que se usa memoria: <span className="keep-case">{data.storeError}</span></p>}
      {error && <div className="error" role="alert">{error}</div>}
    </section>

    <section className="section-block">
      <div className="section-head"><div><div className="eyebrow">por verificar · {pending.length}</div><h2>registros nuevos.</h2></div></div>
      {pending.length === 0 ? <p className={s.empty}>nada pendiente. prueba en /whatsapp escribiendo &quot;quiero registrar mi organización&quot;.</p> :
        <div className={s.cards}>{pending.map(r => <RegCard key={r.id} r={r} busy={busy === r.id} who={who} act={act}/>)}</div>}
    </section>

    <section className="section-block">
      <div className="section-head"><div><div className="eyebrow">entrando ahora</div><h2>ofertas, necesidades y registros.</h2></div></div>
      {(data?.inbox.length ?? 0) === 0 ? <p className={s.empty}>todavía no llega nada.</p> :
        <div className={s.wrap}><table className={s.inbox}><thead><tr><th>hora</th><th>tipo</th><th>de</th><th>qué entendimos</th><th>destinos viables</th></tr></thead>
          <tbody>{data!.inbox.map(i => <tr key={i.id}><td>{new Date(i.at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</td><td>{KIND[i.kind]}</td><td className="keep-case">{regs.find(r => r.id === i.registrationId)?.name ?? (i.source === "simulator" ? "simulador" : i.phone ? `••••${i.phone.slice(-4)}` : "web")}</td><td className="keep-case">{i.summary}</td><td>{i.kind === "offer" ? <>{i.feasible}<a className={s.propose} href={`/agent?message=${encodeURIComponent(i.text)}`}>proponer destino ↗</a></> : "—"}</td></tr>)}</tbody></table></div>}
      <p className={s.note} style={{ marginTop: 12 }}>el botón «proponer destino» abre el agente con la oferta ya cargada. el agente consulta la red y tú firmas; no se llama a meta desde este paso.</p>
    </section>

    {others.length > 0 && <section className="section-block">
      <div className="section-head"><div><div className="eyebrow">ya revisados · {others.length}</div><h2>en la red o fuera.</h2></div></div>
      <div className={s.cards}>{others.map(r => <RegCard key={r.id} r={r} busy={busy === r.id} who={who} act={act}/>)}</div>
    </section>}
    <footer><div className="wordmark"><img src="/grinflow-logo.svg" alt="grinflow"/></div><p>the infrastructure already exists. we’re building the intelligence layer on top.</p><span>lib/registry · lib/auth/team · /api/registry</span></footer>
  </main>;
}

function RegCard({ r, busy, who, act }: { r: Registration; busy: boolean; who: string; act: (b: Record<string, unknown>) => void }) {
  const [place, setPlace] = useState("");
  return <div className={s.card}>
    <div><span className={`${s.pill} ${s[r.status]}`}>{STATUS[r.status]}</span> <small>{r.source === "simulator" ? "simulador" : r.source}</small></div>
    <h3 className="keep-case">{r.name}</h3>
    <dl>
      <dt>qué hace</dt><dd>{rolesLine(r.roles)}</dd>
      <dt>dirección</dt><dd className="keep-case">{r.address ?? "—"}{r.location ? ` · ${r.location.lat.toFixed(4)}, ${r.location.lng.toFixed(4)}` : " · sin ubicar"}</dd>
      <dt>horario</dt><dd className="keep-case">{hoursLabel(r.hours, r.hoursText)}</dd>
      <dt>contacto</dt><dd className="keep-case">{r.contacts.map(c => `${c.name} · ${c.phone}`).join("; ") || "—"}</dd>
      {r.accepts && <><dt>recibe</dt><dd className="keep-case">{acceptsCore(r.accepts)}{r.accepts.weeklyKg ? ` · ~${r.accepts.weeklyKg} kg/sem` : ""}</dd></>}
      {r.selfPickup !== null && <><dt>logística</dt><dd>{r.selfPickup ? "recoge con su gente" : "manda su propio envío"}</dd></>}
      {r.generates && <><dt>le sobra</dt><dd className="keep-case">{r.generates.text}</dd></>}
      {r.verifiedBy && <><dt>revisó</dt><dd className="keep-case">{r.verifiedBy}</dd></>}
    </dl>
    <div className={s.actions}>
      {!r.location && <><select value={place} onChange={e => setPlace(e.target.value)} aria-label="ubicar en colonia"><option value="">ubicar en colonia…</option>{Object.keys(PLACES).map(p => <option key={p} value={p}>{p}</option>)}</select>
        <button className="secondary" disabled={!place || busy} onClick={() => act({ action: "place", id: r.id, lat: PLACES[place].lat, lng: PLACES[place].lng, area: place })}>ubicar</button></>}
      {r.status !== "verified" && <button className="primary" disabled={busy || !r.location} onClick={() => act({ action: "verify", id: r.id, by: who })}>verificar</button>}
      {r.status !== "rejected" && <button className="secondary" disabled={busy} onClick={() => act({ action: "reject", id: r.id, by: who, notes: "" })}>rechazar</button>}
    </div>
  </div>;
}
