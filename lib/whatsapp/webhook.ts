import { createHmac, timingSafeEqual } from "node:crypto";

/** One inbound WhatsApp Cloud API message, reduced to what intake needs. */
export type InboundMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: "text" | "image" | "other";
  text: string;
  mediaId: string | null;
};

/** Meta signs each webhook POST with the app secret (X-Hub-Signature-256: sha256=<hex>). */
export function verifySignature(rawBody: string, header: string | null, appSecret: string | undefined): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex"), "utf8");
  const given = Buffer.from(header.slice("sha256=".length), "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Webhook subscription handshake: echo the challenge only for our own verify token. */
export function verifySubscription(params: URLSearchParams, verifyToken: string | undefined): string | null {
  if (!verifyToken) return null;
  if (params.get("hub.mode") !== "subscribe" || params.get("hub.verify_token") !== verifyToken) return null;
  return params.get("hub.challenge");
}

type Payload = { entry?: { changes?: { value?: { messages?: RawMessage[] } }[] }[] };
type RawMessage = { id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string }; image?: { id?: string; caption?: string } };

/** Extracts messages; status callbacks (sent/delivered/read) carry none and are ignored. */
export function parseInbound(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  for (const entry of (payload as Payload)?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        if (!m.id || !m.from) continue;
        const type = m.type === "text" ? "text" : m.type === "image" ? "image" : "other";
        out.push({
          id: m.id,
          from: m.from,
          timestamp: m.timestamp ?? "",
          type,
          text: (type === "text" ? m.text?.body : type === "image" ? m.image?.caption : "")?.slice(0, 5000) ?? "",
          mediaId: type === "image" ? m.image?.id ?? null : null
        });
      }
    }
  }
  return out;
}

const digits = (value: string) => value.replace(/\D/g, "");

/** Optional allowlist (comma-separated numbers). Empty means any sender that can reach the test number. */
export function isAllowedSender(from: string, allowlist: string | undefined): boolean {
  const list = (allowlist ?? "").split(",").map(digits).filter(Boolean);
  return list.length === 0 || list.includes(digits(from));
}

export function maskPhone(from: string): string {
  const d = digits(from);
  return d.length <= 4 ? "••••" : `••••${d.slice(-4)}`;
}
