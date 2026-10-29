import type { StageState, Tracking } from "@/lib/agent/tracking";
import s from "./agent.module.css";

const STATE_CLASS: Record<StageState, string> = { done: s.stepDone, current: s.stepCurrent, waiting: s.stepWaiting, blocked: s.stepBlocked, pending: s.stepPending };
const STATE_LABEL: Record<StageState, string> = { done: "done", current: "in progress", waiting: "waiting", blocked: "blocked", pending: "next" };
const TONE: Record<Tracking["tone"], string> = { ok: "ok", review: "review", blocked: "blocked-status" };
const time = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" }) : "";

/** One collection, read like a parcel: number, status, eta, and every stage with what was checked. */
export function TrackingCard({ t }: { t: Tracking }) {
  return <div className={s.track}>
    <div className={s.trackTop}>
      <div><div className="tiny-label">tracking number</div><p className={s.code}>{t.code}</p><p className={s.headline}>{t.headline}</p></div>
      <span className={`status ${TONE[t.tone]}`}>{t.etaFinal ? "scheduled · simulated" : t.headline}</span>
    </div>
    {t.eta && <>
      <div className={s.etas}>
        <div className={`${s.eta} ${t.eta.late ? s.etaLate : ""}`}><span>estimated pickup</span><strong>{t.eta.pickup}</strong><small>{t.etaFinal ? "after sign-off" : "if approved now"}{t.eta.late ? " · after the donor's deadline" : ""}</small></div>
        <div className={s.eta}><span>estimated delivery</span><strong>{t.eta.delivery}</strong><small>{t.etaFinal ? "to the recipient" : "if approved now"}</small></div>
      </div>
      <p className={s.basis}>{t.eta.basis}</p>
    </>}
    <ol className={s.steps} style={t.eta ? undefined : { marginTop: 20 }}>
      {t.stages.map((st, i) => <li key={st.key} className={`${s.stepItem} ${STATE_CLASS[st.state]}`}>
        <span className={s.dot} aria-hidden>{st.state === "done" ? "✓" : st.state === "blocked" ? "!" : i + 1}</span>
        <div>
          <div className={s.stepHead}><span className={s.stepLabel}>{st.label}</span><span className={s.stepState}>{STATE_LABEL[st.state]}</span>{st.at && <span className={s.stepTime}>{time(st.at)}</span>}</div>
          {st.detail && <p className={`${s.stepDetail} keep-case`}>{st.detail}</p>}
          {st.checks.length > 0 && <div className={s.chips}>{st.checks.map(c => <span key={c} className={s.chip}>✓ {c}</span>)}</div>}
        </div>
      </li>)}
    </ol>
  </div>;
}

export type SavedCollection = { code: string; token: string; at: string; headline: string };
const KEY = "grinflow.collections";
/** Runs started in this browser, newest first. Storage can be unavailable; the page still works without it. */
export function loadSaved(): SavedCollection[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function save(entry: SavedCollection) {
  try { localStorage.setItem(KEY, JSON.stringify([entry, ...loadSaved().filter(x => x.code !== entry.code)].slice(0, 12))); } catch { /* private mode: nothing to keep */ }
}

/** The run inside a sealed token (the server verified the seal before handing it out). */
export function readRun<T = unknown>(token: string): T {
  const b64 = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))));
}
