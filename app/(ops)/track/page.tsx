"use client";
import { useEffect, useState } from "react";
import type { Tracking } from "@/lib/agent/tracking";
import s from "../agent/agent.module.css";
import { loadSaved, TrackingCard, type SavedCollection } from "../agent/tracking-card";

/** Public tracking: type a gf- number, see where the rescue is. Read-only; nothing here moves a run. */
export default function TrackPage() {
  const [code, setCode] = useState("");
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [recent, setRecent] = useState<SavedCollection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function find(value: string) {
    const wanted = value.trim().toUpperCase();
    if (!wanted) return;
    setBusy(true); setError(""); setTracking(null);
    try {
      // A run started in this browser resolves from its sealed copy; otherwise ask the server.
      const saved = loadSaved().find(x => x.code === wanted);
      const r = saved
        ? await fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: saved.token }) })
        : await fetch(`/api/track?code=${encodeURIComponent(wanted)}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.message || "not found");
      setTracking(d.tracking);
      window.history.replaceState(null, "", `/track?code=${wanted.toLowerCase()}`);
    } catch (e) { setError(e instanceof Error ? e.message : "not found"); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    setRecent(loadSaved());
    const q = new URLSearchParams(window.location.search).get("code");
    if (q) { setCode(q); find(q); }
  }, []);

  return <main className="shell">
    <header className="topbar"><a className="wordmark" href="/intake"><img src="/grinflow-logo.svg" alt="grinflow"/></a><div className="topmeta"><span className="dot"/> tracking <a href="/agent" style={{ marginLeft: 12, color: "#087c62", fontWeight: 700, textDecoration: "none" }}>operator console ↗</a></div></header>
    <section className="hero"><div className="eyebrow">track a rescue</div><h1>where is<br/><em>my food going?</em></h1><p className="lede">every donation gets a tracking number. see each step it has passed, what was checked, and when pickup and delivery are expected.</p></section>
    <div className="warning"><span className="warning-icon">!</span><div><strong>synthetic data · simulated operations</strong><p>pickups and deliveries here are estimates for the demo. no vehicle is dispatched.</p></div></div>
    <section className="workbench">
      <label htmlFor="code">tracking number</label>
      <form className={s.search} onSubmit={e => { e.preventDefault(); find(code); }}>
        <input id="code" value={code} onChange={e => setCode(e.target.value)} placeholder="gf-1a2b3c4d" autoComplete="off" spellCheck={false}/>
        <button className="primary" disabled={busy || !code.trim()}>{busy ? "looking…" : "track ↗"}</button>
      </form>
      {recent.length > 0 && <div className={s.recent}><span className="tiny-label">started in this browser:</span>{recent.map(r => <button key={r.code} className="secondary" onClick={() => { setCode(r.code.toLowerCase()); find(r.code); }}>{r.code.toLowerCase()} · {r.headline}</button>)}</div>}
      {error && <div className="error" role="alert">{error}</div>}
    </section>
    {tracking && <section className="section-block"><TrackingCard t={tracking}/><p className="subhead" style={{ marginTop: 14 }}><a href={`/agent?code=${tracking.code.toLowerCase()}`}>open in the operator console ↗</a></p></section>}
  </main>;
}
