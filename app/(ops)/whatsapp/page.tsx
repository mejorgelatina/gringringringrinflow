"use client";
import { useEffect, useRef, useState } from "react";

type Step = { at: string; step: string; detail: string };
type Trace = { id: string; source: "webhook" | "simulator"; from: string; receivedAt: string; steps: Step[]; reply: string | null; replyStatus: "sent" | "preview" | "failed" | "none"; metaCalls: number; intake: { provider: string; feasible: number; blocked: number; condition: { effective: string; peopleRouteBlocked: boolean } | null } | null };
type Config = { verifyTokenSet: boolean; appSecretSet: boolean; accessTokenSet: boolean; phoneNumberIdSet: boolean; repliesEnabled: boolean; allowlistSet: boolean; metaCallsEnabled: boolean; firebaseSet?: boolean };
type Bubble = { who: "donor" | "grinflow"; text: string; image?: string; trace?: Trace };

const SAMPLES = [
  "Tenemos 20 cajas de pan fresco en la colonia Roma, hay que recogerlas antes de las 6 pm.",
  "Nos sobraron como unas 15 cajas de jitomate en Centro",
  "We have about 12 boxes of apples at the Roma market loading entrance today before 4 PM. Some boxes need inspection."
];

async function toDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export default function WhatsAppDemo() {
  const [text, setText] = useState(SAMPLES[0]);
  const [image, setImage] = useState<string | null>(null);
  const [fixture, setFixture] = useState<"" | "clean" | "mold" | "containers">("");
  const [chat, setChat] = useState<Bubble[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [config, setConfig] = useState<Config | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);

  async function refresh() {
    try { const r = await fetch("/api/whatsapp/status", { cache: "no-store" }); const d = await r.json(); setConfig(d.config); setTraces(d.traces); } catch { /* status is informational */ }
  }
  useEffect(() => { refresh(); }, []);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" }); }, [chat, busy]);

  async function send() {
    setBusy(true); setError("");
    const outgoing: Bubble = { who: "donor", text, image: image ?? undefined };
    setChat(c => [...c, outgoing]);
    try {
      const r = await fetch("/api/whatsapp/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, ...(image ? { image } : {}), ...(image && fixture ? { photoFixture: fixture } : {}) }) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.message || "Simulation failed");
      setChat(c => [...c, { who: "grinflow", text: d.trace.reply ?? "(no reply)", trace: d.trace }]);
      setImage(null); setText(""); refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unexpected error"); }
    finally { setBusy(false); }
  }

  const last = [...chat].reverse().find(b => b.trace)?.trace;
  return <main className="shell">
    <header className="topbar"><a className="wordmark" href="/intake"><img src="/grinflow-logo.svg" alt="grinflow"/></a><div className="topmeta"><span className="dot"/> WHATSAPP CLOUD API · TEST NUMBER <a href="/intake" style={{marginLeft:12,color:"#087c62",fontWeight:700,textDecoration:"none"}}>WEB INTAKE ↗</a></div></header>
    <section className="hero"><div className="eyebrow">CHANNEL · WHATSAPP</div><h1>Donors keep<br/><em>using WhatsApp.</em></h1><p className="lede">A donor writes or sends a photo to a WhatsApp test number. The same intake pipeline drafts the offer, applies the safety gates and replies with one useful question. A person still decides.</p></section>
    <div className="warning"><span className="warning-icon">!</span><div><strong>SIMULATOR USES THE SAME HANDLER AS THE LIVE WEBHOOK</strong><p>Messages here never leave this page as WhatsApp messages. The live webhook at <code>/api/whatsapp/webhook</code> only replies when credentials are set and <code>WHATSAPP_REPLIES_ENABLED=true</code>. Model calls follow <code>META_CALLS_ENABLED</code>.</p></div></div>

    <section className="wa-grid">
      <div className="wa-phone" aria-label="WhatsApp conversation simulator">
        <div className="wa-head"><span className="wa-avatar">g</span><div><strong>GrinFlow</strong><small>test number · simulated</small></div></div>
        <div className="wa-body" aria-live="polite" ref={bodyRef}>
          {chat.length === 0 && <div className="wa-empty">Send a sample message to start.</div>}
          {chat.map((b, i) => <div key={i} className={`wa-bubble ${b.who}`}>{b.image && <img src={b.image} alt="Photo sent by donor"/>}{b.text.split("\n").map((l, j) => <p key={j}>{l}</p>)}{b.trace && <small>{b.trace.replyStatus === "preview" ? "preview · not sent" : b.trace.replyStatus} · {b.trace.metaCalls} Meta call(s)</small>}</div>)}
          {busy && <div className="wa-bubble grinflow typing">…</div>}
        </div>
        <div className="wa-compose">
          <div className="wa-samples">{SAMPLES.map((s, i) => <button key={i} className="secondary" onClick={() => setText(s)}>Sample {i + 1}</button>)}</div>
          <textarea value={text} onChange={e => setText(e.target.value)} maxLength={5000} placeholder="Type as the donor…" aria-label="Donor message"/>
          <div className="wa-actions">
            <label className="photo-pick" htmlFor="wa-photo">{image ? "Change photo" : "+ Photo"}</label>
            <input id="wa-photo" type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async e => { const f = e.target.files?.[0]; setError(""); if (!f) return; try { setImage(await toDataUrl(f)); } catch { setError("Could not read that image."); } }}/>
            {image && <><img className="photo-thumb" src={image} alt="Photo preview"/><label className="fixture-pick">Offline result<select value={fixture} onChange={e => setFixture(e.target.value as typeof fixture)}><option value="">Not analyzed</option><option value="clean">Simulate: intact</option><option value="mold">Simulate: mold</option><option value="containers">Simulate: ~12 food containers</option></select></label></>}
            <button className="primary" onClick={send} disabled={busy || (!text.trim() && !image)}>{busy ? "Sending…" : "Send ↗"}</button>
          </div>
          {error && <div className="error" role="alert">{error}</div>}
        </div>
      </div>

      <div className="wa-side">
        <div className="section-block"><div className="eyebrow">TRACE · LAST MESSAGE</div>
          {!last ? <p className="subhead">Each step of the handler appears here: validation, model or fallback, safety gate, matching, reply.</p> :
            <ol className="wa-trace">{last.steps.map((s, i) => <li key={i}><strong>{s.step}</strong><span>{s.detail}</span></li>)}</ol>}
        </div>
        <div className="section-block"><div className="eyebrow">LIVE SETUP ON THIS DEPLOYMENT</div>
          {config ? <ul className="wa-config">{([
            ["Verify token", config.verifyTokenSet], ["App secret (signature check)", config.appSecretSet], ["Access token", config.accessTokenSet], ["Phone number ID", config.phoneNumberIdSet], ["Replies enabled", config.repliesEnabled], ["Sender allowlist", config.allowlistSet], ["Meta model calls", config.metaCallsEnabled], ["Firestore (durable storage)", Boolean(config.firebaseSet)]
          ] as const).map(([k, v]) => <li key={k}><span className={`wa-dot ${v ? "on" : ""}`}/>{k}<b>{v ? "on" : "off"}</b></li>)}</ul> : <p className="subhead">Loading…</p>}
        </div>
        <div className="section-block"><div className="eyebrow">RECENT TRACES · THIS SERVER INSTANCE</div>
          {traces.length === 0 ? <p className="subhead">No messages yet. Live webhook deliveries appear here with masked numbers and no message text.</p> :
            <ul className="wa-traces">{traces.slice(0, 8).map(t => <li key={t.id}><span className={`status ${t.source === "webhook" ? "ok" : "review"}`}>{t.source}</span><span>{new Date(t.receivedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} · {t.from} · {t.intake ? `${t.intake.feasible} feasible / ${t.intake.blocked} blocked` : t.steps.at(-1)?.step} · reply {t.replyStatus}</span></li>)}</ul>}
        </div>
      </div>
    </section>
    <footer><div className="wordmark"><img src="/grinflow-logo.svg" alt="grinflow"/></div><p>We don’t replace existing infrastructure. We make it work together.</p><span>Setup guide: docs/WHATSAPP_SETUP.md</span></footer>
  </main>;
}
