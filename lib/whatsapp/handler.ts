import { processIntake, type IntakeDeps, type IntakeResult } from "../intake/process.ts";
import { isAcceptableImageDataUrl } from "../meta/photo-policy.ts";
import { fmtRange } from "../icc/spec.ts";
import { isAllowedSender, maskPhone, type InboundMessage } from "./webhook.ts";

export type TraceStep = { at: string; step: string; detail: string };
export type Trace = {
  id: string;
  source: "webhook" | "simulator" | "web";
  from: string;
  receivedAt: string;
  steps: TraceStep[];
  reply: string | null;
  replyStatus: "sent" | "preview" | "failed" | "none";
  metaCalls: number;
  intake: Pick<IntakeResult, "provider" | "supply" | "demand" | "condition" | "photo" | "icc"> & { feasible: number; blocked: number } | null;
};

export type HandlerContext = {
  deps: IntakeDeps;
  allowlist: string | undefined;
  /** When false or missing, the reply is composed and traced but never sent. */
  send: ((to: string, body: string) => Promise<string | null>) | null;
  fetchMedia: ((mediaId: string) => Promise<string>) | null;
  photoFixture?: "clean" | "mold";
  source: Trace["source"];
  now?: () => Date;
};

const CATEGORY_ES: Record<string, string> = { panificados: "pan", verduras: "verdura", frutas: "fruta", lacteos: "lácteos", abarrotes: "abarrotes", proteina: "proteína", organico: "orgánico" };
const MISSING_ES: Record<string, string> = { weight: "¿Tienen el peso total en kilos? Si no, dime qué tipo de caja o contenedor es y lo registramos como estimado.", storage: "¿Estuvo refrigerado? ¿Desde cuándo?", quantity: "¿Cuántas piezas o cajas son, aproximadamente cuántos kilos?", deadline_hour: "¿Hasta qué hora se puede recoger?", location: "¿En qué dirección o colonia se recoge?", category: "¿Qué producto es?", condition: "¿El producto está apto para consumo humano, pasado de su mejor momento, o no comestible?" };
const MISSING_EN: Record<string, string> = { weight: "Do you have the total weight in kilos? If not, tell me what kind of box or container it is and we'll record it as estimated.", storage: "Was it refrigerated? Since when?", quantity: "How many boxes or pieces, and roughly how many kilos?", deadline_hour: "Until what time can it be picked up?", location: "What is the pickup address or neighborhood?", category: "What product is it?", condition: "Is it fit for people, past its prime, or not edible?" };

export function looksEnglish(text: string): boolean {
  return /\b(we|have|the|boxes|pickup|available|today|need|hi|hello|receive)\b/i.test(text) && !/\b(tenemos|cajas|hay|para|recoger|hola|recibir|tengo)\b/i.test(text);
}

const DEMAND_MISSING_ES: Record<string, string> = { location: "¿En qué dirección o colonia reciben?", quantity: "¿Cuánto pueden recibir, aproximadamente (cajas o kilos)?", category: "¿Qué tipo de alimento pueden recibir?", deadline_hour: "¿Hasta qué hora pueden recibir?" };
const DEMAND_MISSING_EN: Record<string, string> = { location: "What address or neighborhood do you receive at?", quantity: "Roughly how much can you take (boxes or kilos)?", category: "What kind of food can you take?", deadline_hour: "Until what time can you receive?" };

/** Reply when there is no offer or need yet: a first "hola" (often from the QR) or an intent without details. */
function promptReply(text: string, en: boolean): string {
  const lower = text.toLocaleLowerCase("es-MX");
  if (/donar|tengo comida|tenemos comida|sobr[oóa]|have food|donate|surplus/.test(lower)) return en
    ? "Great, thanks! Tell me what food it is, how much, where it is and until what time it can be picked up. A photo helps too."
    : "¡Qué bien, gracias! Dime qué alimento es, cuánto hay, dónde está y hasta qué hora se puede recoger. Una foto también ayuda.";
  if (/^(hola|buenas|buen día|buen dia|hi|hello|hey)\b/.test(lower)) return en
    ? "Hi, this is grinflow. Do you have food to give, or can your organization receive food? Tell me what, how much, where and until when, or send a photo."
    : "Hola, soy grinflow. ¿Tienes comida para donar, o tu organización puede recibir comida? Dime qué, cuánto, dónde y hasta qué hora, o mándame una foto.";
  return en
    ? "Thanks. I didn't find a food offer or a need in that message. If you have food to give, tell me what, how much, where and until when. If your organization can receive food, tell me what, how much and where."
    : "Gracias. No encontré una oferta ni una necesidad de alimento en tu mensaje. Si tienes comida para donar, dime qué es, cuánto, dónde y hasta qué hora. Si tu organización puede recibir, dime qué, cuánto y dónde.";
}

function demandReply(en: boolean, r: IntakeResult): string {
  const d = r.demand!;
  const ev = r.extraction.events.find(e => e.kind === "demand_declared");
  const item = ev?.item || (d.category ? (en ? d.category : CATEGORY_ES[d.category] ?? d.category) : null);
  const qty = d.quantity != null ? `${d.quantity} ${d.unit ?? ""}`.trim() : null;
  const place = d.location ? d.location.replace(/\b\p{L}/gu, c => c.toUpperCase()) : null;
  const parts = [qty, item, place ? (en ? `at ${place}` : `en ${place}`) : null, d.untilHour != null ? (en ? `until ${d.untilHour}:00` : `hasta las ${d.untilHour}:00`) : null].filter(Boolean);
  const lines = [parts.length
    ? (en ? `Thanks! I noted that your organization can receive: ${parts.join(", ")}.` : `¡Gracias! Registré que tu organización puede recibir: ${parts.join(", ")}.`)
    : (en ? "Thanks! I noted that your organization can receive food." : "¡Gracias! Registré que tu organización puede recibir alimento.")];
  const missing = ev?.unresolved?.find(m => m in DEMAND_MISSING_ES);
  if (missing) lines.push((en ? DEMAND_MISSING_EN : DEMAND_MISSING_ES)[missing]);
  lines.push(en ? "A person on our team verifies your organization before any food is sent to you." : "Una persona del equipo verifica tu organización antes de enviarte cualquier donación.");
  return lines.join("\n");
}

/** One short reply: what was understood, the single most useful next question, and who decides. */
export function composeReply(text: string, r: IntakeResult): string {
  const en = looksEnglish(text);
  const s = r.supply;
  if (!s) return r.demand ? demandReply(en, r) : promptReply(text, en);
  const ev = r.extraction.events.find(e => e.kind === "supply_announced");
  const item = ev?.item || (s.category ? (en ? s.category : CATEGORY_ES[s.category] ?? s.category) : (en ? "food" : "alimento"));
  const unit = ev?.unit && s.quantity !== 1 ? (ev.unit === "box" ? "boxes" : ev.unit === "kg" || ev.unit.endsWith("s") ? ev.unit : `${ev.unit}s`) : ev?.unit ?? "";
  const qty = s.quantity != null ? `${s.quantityBasis === "estimated" ? (en ? "about " : "aprox. ") : ""}${s.quantity} ${unit}`.trim() : null;
  const place = s.location ? s.location.replace(/\b\p{L}/gu, c => c.toUpperCase()) : null;
  // Weight as ICC knows it: a declared number, or an estimate that says it is one.
  const w = r.icc?.physical.weightKg;
  const weight = w && !(s.quantity != null && ev?.unit === "kg") ? (w.provenance === "estimado" ? (en ? `~${fmtRange(w.value)} kg estimated` : `~${fmtRange(w.value)} kg estimado`) : `${fmtRange(w.value)} kg`) : null;
  const parts = [qty, item, weight, place ? (en ? `at ${place}` : `en ${place}`) : null, s.deadlineHour != null ? (en ? `before ${s.deadlineHour}:00` : `antes de las ${s.deadlineHour}:00`) : null].filter(Boolean);
  const lines = [en ? `Thanks! I noted: ${parts.join(", ")}.` : `¡Gracias! Registré: ${parts.join(", ")}.`];
  const missing = r.icc?.missing.find(m => m.askWho === "donor" && m.field !== "quantity")?.field ?? ev?.unresolved?.[0];
  const photoQuestion = r.photo?.status === "assessed" && r.photo.routing.suggestedCondition !== "unknown" ? r.photo.routing.questionForDonor : null;
  if (r.photo?.status === "failed") lines.push(en ? "I couldn't read the photo. Could you send another one?" : "No pude revisar la foto. ¿Me mandas otra?");
  else if (photoQuestion) lines.push(en ? photoQuestion : "Tu foto muestra posible daño. ¿Sigue apto para personas, o solo para composta?");
  else if (s.quantitySource === "foto") lines.push(en
    ? `From the photo I count about ${s.quantity} ${s.unit ?? "items"}. I can estimate the volume, but I don't have a confirmed weight. How many are there, and do you have the total weight, or shall we record it as estimated?`
    : `Por la foto identifico aproximadamente ${s.quantity} ${s.unit === "caja" ? "cajas" : s.unit === "contenedor" ? "contenedores" : s.unit ?? "piezas"}. Puedo estimar el volumen, pero no tengo el peso confirmado. ¿Cuántos son, y tienen el peso total o lo registramos como estimado?`);
  else if (missing) lines.push((en ? MISSING_EN : MISSING_ES)[missing] ?? (en ? `Can you confirm ${missing.replaceAll("_", " ")}?` : `¿Me confirmas ${missing.replaceAll("_", " ")}?`));
  else if (s.quantityBasis === "estimated") lines.push(en ? `Can you confirm the exact quantity?` : "¿Me confirmas la cantidad exacta?");
  else if (s.condition === "unknown") lines.push(en ? MISSING_EN.condition : MISSING_ES.condition);
  lines.push(en ? "A person on our team reviews this before any pickup is arranged." : "Una persona del equipo lo revisa antes de coordinar cualquier recolección.");
  return lines.join("\n");
}

const seen = new Map<string, number>();
/** Meta redelivers webhooks; a repeated message id must not trigger a second model call. */
export function alreadyHandled(id: string, nowMs = Date.now()): boolean {
  for (const [k, t] of seen) if (nowMs - t > 3_600_000) seen.delete(k);
  if (seen.has(id)) return true;
  seen.set(id, nowMs);
  return false;
}

export async function handleInbound(msg: InboundMessage, ctx: HandlerContext): Promise<Trace> {
  const now = ctx.now ?? (() => new Date());
  const trace: Trace = { id: msg.id, source: ctx.source, from: maskPhone(msg.from), receivedAt: now().toISOString(), steps: [], reply: null, replyStatus: "none", metaCalls: 0, intake: null };
  const step = (name: string, detail: string) => trace.steps.push({ at: now().toISOString(), step: name, detail });
  step("received", `${msg.type} message${msg.text ? ` (${msg.text.length} chars)` : ""}`);

  if (!isAllowedSender(msg.from, ctx.allowlist)) { step("ignored", "Sender is not on WHATSAPP_ALLOWED_SENDERS; no model call, no reply."); return trace; }
  if (msg.type === "other") { step("ignored", "Only text and image messages are handled."); return trace; }

  let image: string | undefined;
  if (msg.type === "image" && msg.mediaId) {
    if (!ctx.fetchMedia) step("photo", "Media download not configured; continuing with the caption only.");
    else {
      try {
        const dataUrl = await ctx.fetchMedia(msg.mediaId);
        if (isAcceptableImageDataUrl(dataUrl)) { image = dataUrl; step("photo", "Image downloaded from WhatsApp and validated (not stored)."); }
        else step("photo", "Image rejected by validation; no model call for it.");
      } catch (e) { step("photo", `Image download failed (${e instanceof Error ? e.message : "error"}); continuing with the caption only.`); }
    }
  }
  const text = msg.text.trim() || (image ? "(photo without caption)" : "");
  if (!text) { step("ignored", "Empty message."); return trace; }

  try {
    const r = await processIntake(text, image, ctx.deps, ctx.photoFixture, ctx.source === "web" ? "web" : "whatsapp");
    trace.metaCalls = r.metaCalls;
    const feasible = r.candidates.filter(c => c.feasible).length;
    trace.intake = { provider: r.provider, supply: r.supply, demand: r.demand, condition: r.condition, photo: r.photo, icc: r.icc, feasible, blocked: r.candidates.length - feasible };
    step("interpreted", `${r.provider} · ${r.metaCalls} Meta call(s) · ${r.supply ? "supply offer drafted" : r.demand ? "receiving organization drafted (needs verification)" : "no offer found"}`);
    if (r.condition) step("safety", `${r.condition.reason} Routing condition: ${r.condition.effective}.`);
    if (r.icc) { const w = r.icc.physical.weightKg; step("icc", `weight ${w ? `${fmtRange(w.value)} kg · ${w.provenance}` : "unknown"} · condition ${r.icc.quality.condition.value} · ${r.icc.quality.condition.provenance} · missing ${r.icc.missing.map(m => m.field).join(", ") || "nothing"}`); }
    if (r.supply) step("matching", `${feasible} feasible, ${r.candidates.length - feasible} blocked (deterministic gates; nothing booked).`);
    trace.reply = composeReply(text, r);
  } catch (e) {
    step("interpreted", `Intake failed (${e instanceof Error ? e.name : "error"}); no retry.`);
    trace.reply = looksEnglish(text) ? "Thanks, we got your message. A person on our team will follow up." : "Gracias, recibimos tu mensaje. Una persona del equipo te contactará.";
  }

  if (!ctx.send) { trace.replyStatus = "preview"; step("reply", "Preview only: WHATSAPP_REPLIES_ENABLED is off or credentials are missing."); return trace; }
  try { const id = await ctx.send(msg.from, trace.reply); trace.replyStatus = "sent"; step("reply", `Sent via WhatsApp Cloud API${id ? ` (${id.slice(0, 12)}…)` : ""}.`); }
  catch (e) { trace.replyStatus = "failed"; step("reply", `Send failed (${e instanceof Error ? e.message : "error"}).`); }
  return trace;
}

const traces: Trace[] = [];
/** In-memory, per server instance, newest first. Enough for a demo; not an audit log. */
export function recordTrace(t: Trace) { traces.unshift(t); traces.length = Math.min(traces.length, 25); }
/** Public view: webhook and web traces come from real people, so their reply text and offer details are withheld. */
export function recentTraces(): Trace[] {
  return traces.map(t => t.source === "simulator" ? t : { ...t, reply: t.reply ? "(withheld: real sender)" : null, intake: t.intake ? { ...t.intake, supply: null, demand: null, photo: null, icc: null } : null });
}
