"use client";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseClientAuth } from "@/lib/firebase/client";
import { ROLE_EXAMPLE, ROLE_LABEL, STATUS_LABEL, acceptsCore, rolesLine } from "@/lib/registry/display";
import type { RegisteredRole, Registration } from "@/lib/registry/types";
import { TeamSignIn } from "../team/sign-in";
import s from "../team/team.module.css";

// Organization accounts (E1): sign in, register the organization once, and see its verification
// status. The server owns every check (/api/org/* authorizes from the verified ID token); this
// page only renders what the server returns.

const ROLES: RegisteredRole[] = ["donor", "receiver", "maker", "compost"];

export default function CuentaPage() {
  const auth = firebaseClientAuth();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [me, setMe] = useState<Registration | null>(null);
  const [none, setNone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [roles, setRoles] = useState<RegisteredRole[]>([]);
  const [address, setAddress] = useState("");
  const [hoursText, setHoursText] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [acceptsText, setAcceptsText] = useState("");
  const [generatesText, setGeneratesText] = useState("");
  const [selfPickup, setSelfPickup] = useState(false);

  useEffect(() => auth ? onAuthStateChanged(auth, u => { setUser(u); setAuthReady(true); }) : undefined, [auth]);

  const load = useCallback(async () => {
    if (!user) { setMe(null); setNone(false); return; }
    setError("");
    try {
      const r = await fetch("/api/org/me", { cache: "no-store", headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const d = await r.json().catch(() => null);
      if (r.status === 404 || d?.error === "no-registration") { setMe(null); setNone(true); return; }
      if (!r.ok || !d?.ok) throw new Error("no se pudo cargar tu registro.");
      setMe(d.registration); setNone(false);
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
  }, [user]);
  useEffect(() => { if (authReady) load(); }, [load, authReady]);

  function toggleRole(r: RegisteredRole) {
    setRoles(rs => rs.includes(r) ? rs.filter(x => x !== r) : [...rs, r]);
  }

  async function register() {
    if (!user) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/org/register", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ name, roles, address, hoursText, contactName, contactPhone, acceptsText, generatesText, selfPickup }) });
      const d = await r.json().catch(() => null);
      if (r.status === 409) { await load(); return; }
      if (!r.ok || !d?.ok) throw new Error(d?.message || "revisa los datos de la organización.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
    finally { setBusy(false); }
  }

  const wantsAccepts = roles.some(r => r === "receiver" || r === "maker" || r === "compost");
  const wantsGenerates = roles.includes("donor");
  const wantsPickup = roles.some(r => r === "receiver" || r === "maker");

  return <div className="shell">
    <div className="topbar"><a className="wordmark" href="/"><span className="mark">g</span>grinflow</a></div>
    <div className="hero">
      <p className="eyebrow">cuentas</p>
      <h1>tu organización <em>en grinflow</em></h1>
      <p className="lede">crea tu cuenta, registra tu organización una vez y sigue su verificación. solo tú ves tus datos.</p>
    </div>
    {!authReady && <div className="section-block"><p className="empty">cargando…</p></div>}
    {authReady && !auth && <div className="section-block"><p className="empty">las cuentas necesitan firebase configurado (NEXT_PUBLIC_FIREBASE_*). sin eso, esta pantalla no puede crear cuentas.</p></div>}
    {authReady && auth && !user && <div className="section-block">
      <div className="section-head"><h2>entra o crea tu cuenta</h2></div>
      <TeamSignIn auth={auth} user={user} onChange={load} emailPlaceholder="correo de tu organización" />
    </div>}
    {authReady && user && <TeamSignIn auth={auth!} user={user} onChange={load} emailPlaceholder="correo de tu organización" />}
    {authReady && user && !me && !none && !error && <div className="section-block"><p className="empty">cargando tu registro…</p></div>}
    {error && <div className="section-block"><p className="error">{error}</p></div>}
    {authReady && user && none && !me && <div className="section-block">
      <div className="section-head"><div><h2>registra tu organización</h2><p className="subhead">una cuenta, un registro. el equipo lo verifica antes de que entre a la red.</p></div></div>
      <div className="review-form">
        <label>nombre<input className="keep-case" value={name} onChange={e => setName(e.target.value)} placeholder="ej. comedor santa fe" maxLength={120} /></label>
        <label>dirección<input className="keep-case" value={address} onChange={e => setAddress(e.target.value)} placeholder="calle, número y colonia" maxLength={200} /></label>
        <label>horario<input className="keep-case" value={hoursText} onChange={e => setHoursText(e.target.value)} placeholder="lunes a viernes de 10 a 5" maxLength={200} /></label>
        <label>contacto<input className="keep-case" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="nombre" maxLength={80} /></label>
        <label>teléfono<input className="keep-case" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="55 1234 5678" maxLength={30} /></label>
      </div>
      <p className="list-label">qué hace tu organización</p>
      <div className="example-row">{ROLES.map(r => <label key={r} className="fixture-pick"><input type="checkbox" checked={roles.includes(r)} onChange={() => toggleRole(r)} />{ROLE_LABEL[r]} · {ROLE_EXAMPLE[r]}</label>)}</div>
      {wantsAccepts && <div className="review-form"><label>qué recibe<input className="keep-case" value={acceptsText} onChange={e => setAcceptsText(e.target.value)} placeholder="pan, fruta y verdura, unos 80 kg" maxLength={500} /></label></div>}
      {wantsGenerates && <div className="review-form"><label>qué le sobra<input className="keep-case" value={generatesText} onChange={e => setGeneratesText(e.target.value)} placeholder="pan del día, unos 20 kg, diario" maxLength={500} /></label></div>}
      {wantsPickup && <div className="example-row"><label className="fixture-pick"><input type="checkbox" checked={selfPickup} onChange={e => setSelfPickup(e.target.checked)} />podemos pasar a recoger el lote</label></div>}
      <div className="decision-buttons" style={{ marginTop: 16 }}><button className="primary" disabled={busy || !name.trim() || !roles.length} onClick={register}>registrar organización</button></div>
      {busy && <p className="provider-note">guardando…</p>}
    </div>}
    {authReady && user && me && <div className="section-block">
      <div className="section-head"><div><h2 className="keep-case">{me.name}</h2><p className="subhead">{rolesLine(me.roles)}</p></div><span className={`status ${me.status === "verified" ? "ok" : "review"}`}>{STATUS_LABEL[me.status]}</span></div>
      {me.status === "pending" && <p className="empty">pendiente de verificación: el equipo revisa tu registro antes de que entre a la red. vuelve aquí para ver el estado.</p>}
      {me.status === "verified" && <p className="empty">verificada: ya puedes operar. tu inicio (/mi) llega en la siguiente entrega.</p>}
      {me.status === "rejected" && <p className="empty">rechazada{me.notes ? `: ${me.notes}` : ". escribe al equipo para revisarla."}</p>}
      <div className={s.bar}><span className={s.who}>id {me.id}</span></div>
      {me.accepts && <p className="subhead">recibe: <span className="keep-case">{acceptsCore(me.accepts, { maker: me.roles.includes("maker") })}{me.accepts.weeklyKg ? ` · ~${me.accepts.weeklyKg} kg/sem` : ""}</span></p>}
    </div>}
  </div>;
}
