"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseClientAuth } from "@/lib/firebase/client";
import type { Mission } from "@/lib/offers/missions";
import { TeamSignIn } from "../team/sign-in";

// Scan a mission QR (E5): the collector proves the pickup with the phone camera (native
// BarcodeDetector where available) or by typing the token; the scan records verified receipt.

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue?: string }[]> };
type DetectorWindow = { BarcodeDetector?: new () => Detector };

export default function ScanPage() {
  const auth = firebaseClientAuth();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [token, setToken] = useState("");
  const [kg, setKg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ mission: Mission; repeated: boolean } | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => auth ? onAuthStateChanged(auth, u => { setUser(u); setAuthReady(true); }) : undefined, [auth]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    setCameraError(""); setError("");
    const DW = window as unknown as DetectorWindow;
    if (!DW.BarcodeDetector) { setCameraError("este navegador no lee qr con la cámara; escribe el código a mano."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stopCamera(); return; }
      video.srcObject = stream;
      await video.play();
      setCameraOn(true);
      const detector = new DW.BarcodeDetector();
      const tick = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(video);
          const value = codes.map(c => c.rawValue).find(v => v && v.trim().length >= 8);
          if (value) { setToken(value.trim()); stopCamera(); return; }
        } catch { /* keep looking */ }
        if (streamRef.current) setTimeout(tick, 400);
      };
      tick();
    } catch {
      stopCamera();
      setCameraError("no se pudo abrir la cámara; escribe el código a mano.");
    }
  }

  async function submit() {
    if (!user || busy) return;
    setBusy(true); setError(""); setDone(null);
    try {
      const r = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ token: token.trim(), receivedKg: Number(kg) }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) throw new Error(d?.message || d?.error || "no se pudo registrar la entrega.");
      setDone({ mission: d.mission as Mission, repeated: !!d.repeated });
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
    finally { setBusy(false); }
  }

  return <div className="shell">
    <div className="topbar"><a className="wordmark" href="/"><span className="mark">g</span>grinflow</a></div>
    {!authReady && <div className="section-block"><p className="empty">cargando…</p></div>}
    {authReady && !auth && <div className="section-block"><p className="empty">escanear necesita firebase configurado (NEXT_PUBLIC_FIREBASE_*).</p></div>}
    {authReady && auth && !user && <div className="section-block">
      <div className="section-head"><h2>entra para escanear</h2></div>
      <TeamSignIn auth={auth} user={user} onChange={() => { }} emailPlaceholder="correo de tu organización" />
    </div>}
    {authReady && user && <>
      <div className="hero">
        <p className="eyebrow">escanear misión</p>
        <h1>recoge y confirma</h1>
        <p className="lede">apunta al qr de la misión o escribe el código, indica los kilos que sí llegaron y confirma. solo la organización que aceptó puede escanear.</p>
      </div>
      <div className="section-block">
        <div className="section-head"><h2>código de la misión</h2></div>
        {!cameraOn && <p><button className="secondary" onClick={startCamera}>abrir cámara ↗</button></p>}
        {cameraError && <p className="empty">{cameraError}</p>}
        <video ref={videoRef} style={{ display: cameraOn ? "block" : "none", width: "100%", maxWidth: 420 }} muted playsInline />
        {cameraOn && <p><button className="secondary" onClick={stopCamera}>cerrar cámara</button></p>}
        <label htmlFor="token">código (16 caracteres)</label>
        <input id="token" className="keep-case" value={token} onChange={e => setToken(e.target.value)} maxLength={64} placeholder="escanéalo o escríbelo" autoComplete="off" />
        <label htmlFor="kg">kilos que sí llegaron</label>
        <input id="kg" type="number" min="0.1" step="0.1" value={kg} onChange={e => setKg(e.target.value)} placeholder="kg" style={{ width: 120 }} />
        <div className="input-foot"><span>verificamos el peso contra lo apartado</span>
          <button className="primary" onClick={submit} disabled={busy || !token.trim() || !kg}>{busy ? "confirmando…" : "confirmar recepción ↗"}</button></div>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      {done && <div className="section-block">
        <div className="section-head"><h2>{done.repeated ? "ya estaba confirmada" : "recepción confirmada"}</h2></div>
        <p>{done.mission.receivedKg} kg recibidos de {done.mission.kg} kg apartados.</p>
        <p><a href="/recibir">volver a /recibir ↗</a></p>
      </div>}
    </>}
  </div>;
}
