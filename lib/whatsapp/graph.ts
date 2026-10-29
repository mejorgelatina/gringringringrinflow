/** Minimal WhatsApp Cloud API client: fetch an inbound image and send a text reply. */
const GRAPH = "https://graph.facebook.com";
const MAX_MEDIA_BYTES = 2_000_000;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export type GraphConfig = { token: string; version: string; phoneNumberId: string };

export function graphConfig(): GraphConfig | null {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;
  return { token, phoneNumberId, version: process.env.WHATSAPP_GRAPH_VERSION || "v22.0" };
}

/** Two requests: media metadata, then the bytes. Rejects types and sizes intake would refuse anyway. */
export async function downloadMediaAsDataUrl(mediaId: string, cfg: GraphConfig): Promise<string> {
  const auth = { Authorization: `Bearer ${cfg.token}` };
  const metaRes = await fetch(`${GRAPH}/${cfg.version}/${encodeURIComponent(mediaId)}`, { headers: auth, signal: AbortSignal.timeout(10_000) });
  if (!metaRes.ok) throw new Error(`media_lookup_${metaRes.status}`);
  const meta = await metaRes.json() as { url?: string; mime_type?: string; file_size?: number };
  if (!meta.url || !meta.mime_type || !ALLOWED_MIME.has(meta.mime_type)) throw new Error("media_type_unsupported");
  if ((meta.file_size ?? 0) > MAX_MEDIA_BYTES) throw new Error("media_too_large");
  const bin = await fetch(meta.url, { headers: auth, signal: AbortSignal.timeout(15_000) });
  if (!bin.ok) throw new Error(`media_download_${bin.status}`);
  const bytes = Buffer.from(await bin.arrayBuffer());
  if (bytes.length > MAX_MEDIA_BYTES) throw new Error("media_too_large");
  return `data:${meta.mime_type};base64,${bytes.toString("base64")}`;
}

export async function sendText(to: string, body: string, cfg: GraphConfig): Promise<string | null> {
  const res = await fetch(`${GRAPH}/${cfg.version}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: body.slice(0, 4096) } }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!res.ok) throw new Error(`send_${res.status}`);
  const data = await res.json() as { messages?: { id?: string }[] };
  return data.messages?.[0]?.id ?? null;
}
