"use client";
import { useEffect, useState } from "react";

// PWA shell (E8): registers the service worker and offers installation. Self-styled so it works
// in both root layouts. Rendered once per layout; invisible until there is something to offer.

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const bar: React.CSSProperties = {
  position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 50,
  display: "flex", alignItems: "center", gap: 12,
  background: "#10211d", color: "#fff", borderRadius: 12, padding: "12px 14px",
  fontFamily: "system-ui, sans-serif", fontSize: 13, lineHeight: 1.45,
  boxShadow: "0 8px 30px rgba(16,33,29,.35)",
};
const btn: React.CSSProperties = {
  border: 0, cursor: "pointer", borderRadius: 8, padding: "10px 14px",
  background: "#368a62", color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0,
};
const ghost: React.CSSProperties = { ...btn, background: "transparent", color: "#c4e8cc", padding: "10px 8px" };

export function PwaShell() {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as PromptEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
    if (ios && !localStorage.getItem("gf-ios-hint")) setIosHint(true);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (prompt) {
    return <div style={bar} role="dialog" aria-label="instalar grinflow">
      <span style={{ flex: 1 }}>instala grinflow para abrirla como app, también sin conexión.</span>
      <button style={btn} onClick={() => { prompt.prompt(); setPrompt(null); }}>instalar</button>
      <button style={ghost} onClick={() => setPrompt(null)} aria-label="descartar">luego</button>
    </div>;
  }
  if (iosHint) {
    return <div style={bar} role="dialog" aria-label="agregar grinflow al inicio">
      <span style={{ flex: 1 }}>en iphone: compartir → “agregar a inicio” para abrir grinflow como app.</span>
      <button style={ghost} onClick={() => { localStorage.setItem("gf-ios-hint", "1"); setIosHint(false); }} aria-label="descartar">entendido</button>
    </div>;
  }
  return null;
}
