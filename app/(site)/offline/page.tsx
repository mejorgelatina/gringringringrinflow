// Offline fallback (E8): pure server component with inline styles, so it renders from the
// service-worker cache even when no CSS was cached. Plain link retries through the network.
export default function OfflinePage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f6f7f3", color: "#10211d", fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <p style={{ fontSize: 12, letterSpacing: 1, color: "#245e43", margin: "0 0 12px" }}>sin conexión</p>
        <h1 style={{ fontSize: 32, margin: "0 0 12px" }}>no hay internet ahora mismo.</h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "#3c4a44" }}>lo que ya abriste sigue disponible. cuando vuelva la red, reintenta.</p>
        <p style={{ marginTop: 20 }}>
          <a href="/" style={{ display: "inline-block", background: "#368a62", color: "#fff", fontWeight: 700, fontSize: 14, padding: "12px 18px", borderRadius: 8, textDecoration: "none" }}>reintentar</a>
        </p>
      </div>
    </main>
  );
}
