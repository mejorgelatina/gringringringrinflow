"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Mission QR, rendered locally in the browser: the token never leaves the device to be drawn.
// Same renderer and colors as the /qr page.
export function MissionQr({ token }: { token: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toString(token, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#10211d", light: "#ffffff" } }).then(
      (s) => { if (alive) setSvg(s); },
      () => { if (alive) setSvg(""); },
    );
    return () => { alive = false; };
  }, [token]);
  if (!svg) return <p className="empty">código: <span className="keep-case">{token}</span></p>;
  return <div dangerouslySetInnerHTML={{ __html: svg }} style={{ width: 180 }} />;
}
