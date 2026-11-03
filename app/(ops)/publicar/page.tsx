"use client";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseClientAuth } from "@/lib/firebase/client";
import type { Offer } from "@/lib/offers/types";
import type { PublicRegistration } from "@/lib/registry/display";
import { TeamSignIn } from "../team/sign-in";

// Publish an offer (E3): donor text plus up to three photos. The server runs extraction, ICC,
// eligibility and the agent, then persists the evidence under the caller's uid.

async function toDataUrl(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${file.type || "image/jpeg"};base64,${btoa(bin)}`;
}

const MAX_PHOTO_BYTES = 2_800_000;

export default function PublicarPage() {
  const auth = firebaseClientAuth();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [reg, setReg] = useState<PublicRegistration | null>(null);
  const [none, setNone] = useState(false);
  const [message, setMessage] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [confirmEdible, setConfirmEdible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [offer, setOffer] = useState<Offer | null>(null);

  useEffect(() => auth ? onAuthStateChanged(auth, u => { setUser(u); setAuthReady(true); }) : undefined, [auth]);

  const load = useCallback(async () => {
    if (!user) { setReg(null); setNone(false); return; }
    try {
      const r = await fetch("/api/org/me", { cache: "no-store", headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const d = await r.json().catch(() => null);
      if (r.status === 404 || d?.error === "no-registration") { setReg(null); setNone(true); return; }
      if (!r.ok || !d?.ok) throw new Error("no se pudo cargar tu organización.");
      setReg(d.registration); setNone(false);
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
  }, [user]);
  useEffect(() => { if (authReady) load(); }, [load, authReady]);

  async function pickPhoto(file: File | undefined) {
    setError("");
    if (!file || photos.length >= 3) return;
    if (file.size > MAX_PHOTO_BYTES) { setError("esa foto pesa más de 3mb; elige una más ligera."); return; }
    try { const url = await toDataUrl(file); setPhotos(p => [...p, url].slice(0, 3)); }
    catch { setError("no se pudo leer esa imagen; prueba con jpeg o png."); }
  }

  async function submit() {
    if (!user || busy) return;
    setBusy(true); setError(""); setOffer(null);
    try {
      const r = await fetch("/api/offers", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ message: message.trim(), photos, confirmEdible }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) throw new Error(d?.message || d?.error || "no se pudo publicar la oferta.");
      setOffer(d.offer as Offer);
      setMessage(""); setPhotos([]); setConfirmEdible(false);
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
    finally { setBusy(false); }
  }

  const isDonor = !!reg?.roles.includes("donor");

  return <div className="shell">
    <div className="topbar"><a className="wordmark" href="/"><span className="mark">g</span>grinflow</a></div>
    {!authReady && <div className="section-block"><p className="empty">cargando…</p></div>}
    {authReady && !auth && <div className="section-block"><p className="empty">publicar necesita firebase configurado (NEXT_PUBLIC_FIREBASE_*).</p></div>}
    {authReady && auth && !user && <div className="section-block">
      <div className="section-head"><h2>entra para publicar</h2></div>
      <TeamSignIn auth={auth} user={user} onChange={load} emailPlaceholder="correo de tu organización" />
    </div>}
    {authReady && user && none && <div className="section-block">
      <p className="empty">aún no registras tu organización. <a href="/cuenta">regístrala en /cuenta</a> y vuelve aquí.</p>
    </div>}
    {authReady && user && reg && !isDonor && <div className="section-block">
      <p className="empty">solo las organizaciones donantes publican ofertas. tu registro es de otro tipo.</p>
    </div>}
    {authReady && user && reg && isDonor && <>
      <div className="hero">
        <p className="eyebrow">publicar oferta</p>
        <h1>qué te sobra, <em className="keep-case">{reg.name}</em></h1>
        <p className="lede">describe el lote con tus palabras y agrega hasta 3 fotos. grinflow lo analiza y te dice a dónde puede ir. las fotos se analizan, nunca se guardan.</p>
      </div>
      <div className="section-block">
        <div className="section-head"><h2>tu lote</h2></div>
        <label htmlFor="message">describe qué es, cuánto hay, dónde recogerlo y hasta cuándo</label>
        <textarea id="message" className="keep-case" value={message} onChange={e => setMessage(e.target.value)} maxLength={2000}
          placeholder="ej. 20kg de pan de ayer en buen estado, recoger en roma norte antes de las 6pm" />
        <div className="photo-row">
          {photos.length < 3 && <><label className="photo-pick" htmlFor="photo">+ agregar foto ({photos.length}/3, opcional)</label>
            <input id="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} hidden /></>}
          {photos.map((p, i) => <span key={i}><img className="photo-thumb" src={p} alt={`foto ${i + 1} del lote`} />
            <button className="secondary" onClick={() => setPhotos(ps => ps.filter((_, j) => j !== i))}>quitar</button></span>)}
        </div>
        <label><input type="checkbox" checked={confirmEdible} onChange={e => setConfirmEdible(e.target.checked)} /> confirmo que es apto para consumo humano</label>
        <div className="input-foot"><span>{message.length}/2,000 caracteres · {photos.length}/3 fotos</span>
          <button className="primary" onClick={submit} disabled={busy || !message.trim()}>{busy ? "publicando…" : "publicar oferta ↗"}</button></div>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      {offer && <div className="section-block">
        <div className="section-head"><h2>oferta publicada</h2><span className="step">{offer.status === "open" ? "abierta" : offer.status === "needs_review" ? "en revisión" : "cerrada"}</span></div>
        <p>{offer.item || offer.category || "lote"} · {offer.eligible.length} destino(s) elegible(s){offer.tier ? ` · tier ${offer.tier}` : " · sin tier todavía"}</p>
        {offer.eligible.length > 0 && <p className="keep-case">puede ir a: {offer.eligible.slice(0, 5).map(e => e.name).join(", ")}{offer.eligible.length > 5 ? ` y ${offer.eligible.length - 5} más` : ""}.</p>}
        {offer.proposal && <p className="keep-case">el agente propone: {offer.proposal.recipient} ({offer.proposal.capacity}). falta la firma humana.</p>}
        {!offer.proposal && <p className="empty">el agente aún no tiene propuesta (estado: {offer.agentStatus}).</p>}
        {offer.warnings.map((w, i) => <p key={i} className="empty">aviso: {w.message}</p>)}
        {offer.reviewReasons.map((r, i) => <p key={i} className="empty">revisión: {r}</p>)}
        <p>{offer.agentCode && <a href={`/track?code=${offer.agentCode}`}>ver seguimiento {offer.agentCode} ↗</a>} · <a href="/mi">ver mis ofertas en /mi ↗</a></p>
      </div>}
    </>}
  </div>;
}
