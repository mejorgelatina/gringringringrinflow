/**
 * Builds the donor-facing approval message without sending it.
 * Sending remains owned by the WhatsApp webhook and is gated separately.
 */
export function approvalReply(code: string, baseUrl: string): string | null {
  if (process.env.WHATSAPP_REPLIES_ENABLED !== "true") return null;
  const normalized = code.trim().toUpperCase();
  if (!/^GF-[A-Z0-9]+$/.test(normalized)) return null;
  const origin = baseUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(origin)) return null;
  return `Tu donación fue aprobada por el equipo. Consulta el rastreo: ${origin}/track/${normalized}. Las horas son estimadas y la recolección sigue siendo una simulación.`;
}
