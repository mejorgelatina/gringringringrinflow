import type { AgentRun } from "../agent/types.ts";
import type { RegistryStore } from "../registry/store.ts";
import type { Notice, NoticeAudience, Registration, RunLink } from "../registry/types.ts";

// Outbound WhatsApp: what grinflow tells people after a person on the team decides something.
//
// WhatsApp rules decide the shape of every message:
//  - inside 24 h of the person's last message we may answer with free text ("session");
//  - outside it, or when we write first (a receiver who never wrote today), only a template that Meta
//    approved beforehand may be sent, and only to someone who opted in.
// So every notice is planned as session text or as a named template with parameters, and delivery is
// gated twice: WHATSAPP_REPLIES_ENABLED (+ credentials) for anything, WHATSAPP_TEMPLATES_APPROVED=true for
// templates. Until then each notice is kept as a "preview" with the exact text, so the team sees it.

export const SERVICE_WINDOW_MS = 24 * 3600_000;
export const TEMPLATE_LANGUAGE = "es_MX";

/**
 * Template drafts to submit in WhatsApp Manager (category: utility). Parameters are {{1}}, {{2}}…
 * Keep these in sync with docs/WHATSAPP_TEMPLATES.md, which is what gets pasted into Meta.
 */
export const TEMPLATES = {
  grinflow_donacion_aprobada: {
    audience: "donor" as NoticeAudience,
    body: "tu donación {{1}} ya tiene destino: {{2}}. sigue la recolección aquí: {{3}}. gracias por no dejar que se desperdicie.",
    example: ["GF-1A2B3C4D", "comedor comunitario la esperanza", "https://grinflow.app/track/GF-1A2B3C4D"],
  },
  grinflow_donacion_asignada: {
    audience: "receiver" as NoticeAudience,
    body: "hola {{1}}, grinflow les apartó una donación: {{2}}. {{3}}. código de entrega: {{4}}. si ya no pueden recibirla, respondan a este mensaje para liberarla.",
    example: ["comedor la esperanza", "20 cajas de pan (~60 kg estimado) en roma norte", "recogen ustedes antes de las 18:00", "GF-1A2B3C4D"],
  },
  grinflow_registro_verificado: {
    audience: "organization" as NoticeAudience,
    body: "{{1}} ya está verificada en la red de grinflow. les escribiremos por aquí cuando haya alimento o material para ustedes.",
    example: ["comedor la esperanza"],
  },
} as const;

export type TemplateName = keyof typeof TEMPLATES;

export function renderTemplate(name: TemplateName, params: string[]): string {
  return TEMPLATES[name].body.replace(/\{\{(\d+)\}\}/g, (_, i) => params[Number(i) - 1] ?? "");
}

export const insideServiceWindow = (lastInboundAt: string | null | undefined, now: Date) =>
  Boolean(lastInboundAt) && now.getTime() - Date.parse(lastInboundAt!) < SERVICE_WINDOW_MS;

export const trackUrl = (baseUrl: string | null, code: string) => (baseUrl ? `${baseUrl.replace(/\/+$/, "")}/track/${code}` : `/track/${code}`);

type Draft = Omit<Notice, "status" | "detail">;

const MODE_ES: Record<string, string> = { pickup: "recogen ustedes", own_courier: "mandan su propio envío", courier: "envío cotizado", backhaul: "ruta de regreso" };

function lotLine(run: AgentRun): string {
  const s = run.supply;
  const ev = run.extraction?.events.find((e) => e.kind === "supply_announced");
  const what = [s?.quantity != null ? `${s.quantity}${ev?.unit ? ` ${ev.unit}` : ""}` : null, ev?.item || s?.category || "alimento"].filter(Boolean).join(" de ");
  const kg = run.operation ? ` (${run.operation.kg} kg${run.operation.kgProvenance === "estimado" ? " estimado" : ""})` : "";
  return `${what}${kg}${s?.location ? ` en ${s.location}` : ""}`;
}

/**
 * What to tell whom when an operator approves a run: the donor (tracking link) and, when the destination is a
 * registered organization that opted in, the receiver (what was held for them, how, and the handoff code).
 * Pure: no sending, no store.
 */
export function planApprovalNotices(run: AgentRun, link: RunLink | null, receiver: Registration | null, baseUrl: string | null, now: Date): Draft[] {
  if (run.status !== "approved" || !run.proposal) return [];
  const at = now.toISOString();
  const out: Draft[] = [];
  const url = trackUrl(baseUrl, run.code);
  if (link?.phone) {
    const params = [run.code, run.proposal.recipient, url];
    const session = insideServiceWindow(link.lastInboundAt, now);
    out.push({
      id: `n-${run.code}-donor`, at, audience: "donor", to: link.phone, source: link.source, runCode: run.code, registrationId: null,
      mode: session ? "session" : "template",
      template: session ? null : { name: "grinflow_donacion_aprobada", language: TEMPLATE_LANGUAGE, params },
      body: session
        ? `¡listo! una persona del equipo aprobó tu donación ${run.code}. va para ${run.proposal.recipient}. sigue la recolección aquí: ${url}`
        : renderTemplate("grinflow_donacion_aprobada", params),
    });
  }
  if (receiver?.phone && receiver.status === "verified") {
    const op = run.operation;
    const deadline = run.supply?.deadlineHour != null ? ` antes de las ${run.supply.deadlineHour}:00` : "";
    const how = op ? `${MODE_ES[op.mode] ?? op.mode}${deadline}` : `coordinamos la entrega${deadline}`;
    const params = [receiver.name, lotLine(run), how, op?.handoffCode ?? run.code];
    out.push({
      id: `n-${run.code}-receiver`, at, audience: "receiver", to: receiver.phone, source: receiver.source, runCode: run.code, registrationId: receiver.id,
      mode: "template", template: { name: "grinflow_donacion_asignada", language: TEMPLATE_LANGUAGE, params }, body: renderTemplate("grinflow_donacion_asignada", params),
    });
  }
  return out;
}

/** Tells an organization it is in the network, once a person verifies it. */
export function planVerifiedNotice(reg: Registration, now: Date): Draft | null {
  if (reg.status !== "verified" || !reg.phone) return null;
  const params = [reg.name];
  return {
    id: `n-${reg.id}-verified`, at: now.toISOString(), audience: "organization", to: reg.phone, source: reg.source, runCode: null, registrationId: reg.id,
    mode: "template", template: { name: "grinflow_registro_verificado", language: TEMPLATE_LANGUAGE, params }, body: renderTemplate("grinflow_registro_verificado", params),
  };
}

export type Outbound = {
  sendText: ((to: string, body: string) => Promise<string | null>) | null;
  sendTemplate: ((to: string, name: string, language: string, params: string[]) => Promise<string | null>) | null;
};

/**
 * Sends what may be sent and records every notice. Never sends to simulator or web senders (no real number),
 * to receivers without WhatsApp opt-in, or templates before Meta approved them.
 */
export async function deliverNotices(drafts: Draft[], out: Outbound, opts: { optIn?: (n: Draft) => boolean; store?: RegistryStore | null } = {}): Promise<Notice[]> {
  const done: Notice[] = [];
  for (const d of drafts) {
    let n: Notice;
    if (d.source !== "webhook") n = { ...d, status: "preview", detail: d.source === "simulator" ? "simulador: no se envía nada" : "llegó por el chat web: no hay número de whatsapp" };
    else if (opts.optIn && !opts.optIn(d)) n = { ...d, status: "skipped", detail: "sin opt-in de whatsapp: grinflow no puede escribir primero" };
    else if (d.mode === "session" && !out.sendText) n = { ...d, status: "preview", detail: "WHATSAPP_REPLIES_ENABLED apagado o faltan credenciales" };
    else if (d.mode === "template" && !out.sendTemplate) n = { ...d, status: "preview", detail: "plantilla sin aprobar (WHATSAPP_TEMPLATES_APPROVED no es true) o respuestas apagadas" };
    else {
      try {
        const id = d.mode === "session" ? await out.sendText!(d.to, d.body) : await out.sendTemplate!(d.to, d.template!.name, d.template!.language, d.template!.params);
        n = { ...d, status: "sent", detail: `enviado por whatsapp cloud api${id ? ` (${id.slice(0, 12)}…)` : ""}` };
      } catch (e) {
        n = { ...d, status: "failed", detail: `falló el envío (${e instanceof Error ? e.message : "error"})` };
      }
    }
    if (opts.store) {
      try { await opts.store.addNotice(n); } catch (e) { n = { ...n, detail: `${n.detail}; no se guardó (${e instanceof Error ? e.message : "error"})` }; }
    }
    done.push(n);
  }
  return done;
}

/** The view a browser may get: number masked. */
export const publicNotice = (n: Notice) => ({ ...n, to: n.to ? `••••${n.to.slice(-4)}` : "" });
