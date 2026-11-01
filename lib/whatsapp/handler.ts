import { processIntake, type IntakeDeps, type IntakeResult } from "../intake/process.ts";
import { isAcceptableImageDataUrl } from "../meta/photo-policy.ts";
import { fmtRange } from "../icc/spec.ts";
import { isAllowedSender, maskPhone, type InboundMessage } from "./webhook.ts";
import type { RegistryStore } from "../registry/store.ts";
import type { Conversation, Registration } from "../registry/types.ts";
import { continueOnboarding, startOnboarding } from "../registry/onboarding.ts";
import { wantsToRegister } from "../registry/parse.ts";
import { refreshLiveNetwork } from "../registry/network.ts";

export type TraceStep = { at: string; step: string; detail: string };
export type Trace = {
  id: string;
  source: "webhook" | "simulator" | "web";
  /** Set while the sender is registering: the step answered, and the registration id once finished. */
  onboarding?: { step: string; registrationId: string | null } | null;
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
  photoFixture?: "clean" | "mold" | "containers";
  source: Trace["source"];
  now?: () => Date;
  /** Registrations, conversation memory and the team inbox. Without it every message is handled alone. */
  store?: RegistryStore | null;
  /** Overrides the conversation key (the web chat passes a per-browser session). Default: source + number. */
  conversationKey?: string;
};

/** A conversation goes quiet after this long; the next message starts fresh. */
const MEMORY_MS = 2 * 3600_000;
/** An unfinished registration is dropped after a day. */
const ONBOARDING_MS = 24 * 3600_000;
const MAX_TURNS = 8;

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
    ? "Hi, this is grinflow. Do you have food to give, or can your organization receive food? Tell me what, how much, where and until when, or send a photo. To register your organization, write \"register\"."
    : "Hola, soy grinflow. ¿Tienes comida para donar, o tu organización puede recibir comida? Dime qué, cuánto, dónde y hasta qué hora, o mándame una foto. Si quieres dar de alta tu organización, escribe \"registrar\".";
  return en
    ? "Thanks. I didn't find a food offer or a need in that message. If you have food to give, tell me what, how much, where and until when. If your organization can receive food, tell me what, how much and where."
    : "Gracias. No encontré una oferta ni una necesidad de alimento en tu mensaje. Si tienes comida para donar, dime qué es, cuánto, dónde y hasta qué hora. Si tu organización puede recibir, dime qué, cuánto y dónde.";
}

function demandReply(en: boolean, r: IntakeResult, registered: Registration | null = null): string {
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
  if (registered) lines.push(en ? `Noted for ${registered.name}. A person on our team reviews it before any food is sent.` : `Lo anoté para ${registered.name}. Una persona del equipo lo revisa antes de enviarte cualquier donación.`);
  else lines.push(en ? "To receive offers, register your organization first: write \"register\". A person on our team verifies it." : "Para que te lleguen ofertas, primero registra tu organización: escribe \"registrar\". Una persona del equipo la verifica.");
  return lines.join("\n");
}

/** One short reply: what was understood, the single most useful next question, and who decides. */
export function composeReply(text: string, r: IntakeResult, registered: Registration | null = null): string {
  const en = looksEnglish(text);
  const s = r.supply;
  if (!s) return r.demand ? demandReply(en, r, registered) : promptReply(text, en);
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
  // The extractor's "unresolved" list only saw the text; a pin or the donor's registration may already answer it.
  const known: Record<string, boolean> = { location: Boolean(s.location || s.point), deadline_hour: s.deadlineHour != null, quantity: s.quantity != null, category: Boolean(s.category) };
  const missing = r.icc?.missing.find(m => m.askWho === "donor" && m.field !== "quantity")?.field ?? ev?.unresolved?.find(u => !known[u]);
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

function freshConversation(key: string, phone: string, source: Trace["source"], at: string): Conversation {
  return { key, phone, source, history: [], openQuestion: false, onboarding: null, pin: null, updatedAt: at };
}

const asksSomething = (reply: string) => /\?/.test(reply);

export async function handleInbound(msg: InboundMessage, ctx: HandlerContext): Promise<Trace> {
  const now = ctx.now ?? (() => new Date());
  const trace: Trace = { id: msg.id, source: ctx.source, from: maskPhone(msg.from), receivedAt: now().toISOString(), steps: [], reply: null, replyStatus: "none", metaCalls: 0, intake: null };
  const step = (name: string, detail: string) => trace.steps.push({ at: now().toISOString(), step: name, detail });
  step("received", `${msg.type} message${msg.text ? ` (${msg.text.length} chars)` : ""}`);

  if (!isAllowedSender(msg.from, ctx.allowlist)) { step("ignored", "Sender is not on WHATSAPP_ALLOWED_SENDERS; no model call, no reply."); return trace; }
  if (msg.type === "other") { step("ignored", "Only text, image and location messages are handled."); return trace; }

  // Memory: who this sender is (registration) and what we were talking about (conversation).
  const store = ctx.store ?? null;
  const phone = msg.from.replace(/\D/g, "");
  const key = ctx.conversationKey ?? `${ctx.source}:${phone}`;
  const at = now();
  let conv: Conversation | null = null;
  let registered: Registration | null = null;
  if (store) {
    try {
      conv = await store.getConversation(key);
      if (conv && at.getTime() - Date.parse(conv.updatedAt) > MEMORY_MS) conv = { ...conv, history: [], openQuestion: false, pin: null, onboarding: conv.onboarding && at.getTime() - Date.parse(conv.onboarding.startedAt) < ONBOARDING_MS ? conv.onboarding : null };
      conv ??= freshConversation(key, phone, ctx.source, at.toISOString());
      registered = phone ? await store.findRegistrationByPhone(phone) : null;
      await refreshLiveNetwork(store);
      if (registered) step("sender", `registered as ${registered.name} (${registered.status})`);
    } catch (e) {
      step("memory", `Conversation store unavailable (${e instanceof Error ? e.message : "error"}); handling this message alone.`);
      conv = null;
    }
  }
  const pin = msg.type === "location" && msg.location ? { point: { lat: msg.location.lat, lng: msg.location.lng }, label: msg.location.label || "ubicación compartida" } : null;
  const finish = async (reply: string) => {
    trace.reply = reply;
    if (store && conv) { conv.updatedAt = now().toISOString(); try { await store.saveConversation(conv); } catch (e) { step("memory", `Could not save the conversation (${e instanceof Error ? e.message : "error"}).`); } }
    return send();
  };
  const send = async () => {
    if (!ctx.send) { trace.replyStatus = "preview"; step("reply", "Preview only: WHATSAPP_REPLIES_ENABLED is off or credentials are missing."); return trace; }
    try { const id = await ctx.send(msg.from, trace.reply!); trace.replyStatus = "sent"; step("reply", `Sent via WhatsApp Cloud API${id ? ` (${id.slice(0, 12)}…)` : ""}.`); }
    catch (e) { trace.replyStatus = "failed"; step("reply", `Send failed (${e instanceof Error ? e.message : "error"}).`); }
    return trace;
  };

  // Onboarding: a short guided conversation, no model call.
  if (store && conv && (conv.onboarding || (msg.text && wantsToRegister(msg.text)))) {
    const out = conv.onboarding
      ? continueOnboarding(conv.onboarding, { text: msg.text, pin }, { phone, source: ctx.source, now: at })
      : startOnboarding(at, registered);
    trace.onboarding = { step: conv.onboarding?.step ?? "start", registrationId: out.completed?.id ?? null };
    step("onboarding", out.completed ? `registration ${out.completed.id} saved as pending verification` : out.cancelled ? "cancelled" : `asked: ${out.state?.step}`);
    if (out.completed) {
      const previous = out.completed.id && registered?.id === out.completed.id ? registered : null;
      const reg: Registration = previous ? { ...out.completed, createdAt: previous.createdAt } : out.completed;
      await store.saveRegistration(reg);
      await store.addInbox({ id: `in-${msg.id}`, at: reg.updatedAt, phone, source: ctx.source, kind: "registration", summary: `${previous ? "actualizó su registro" : "nuevo registro"}: ${reg.name} · ${reg.roles.map(x => ({ donor: "dona", receiver: "recibe", maker: "maker", compost: "composta" })[x]).join(", ")}`, text: "", registrationId: reg.id, feasible: 0 });
    }
    conv.onboarding = out.state;
    conv.history = []; conv.openQuestion = false;
    return finish(out.reply);
  }

  // A location pin outside onboarding: remember it as the pickup point for the offer in progress.
  if (pin && conv) {
    conv.pin = { ...pin, at: at.toISOString() };
    step("location", "pin saved as the pickup point for this conversation");
    if (!conv.history.length) return finish(looksEnglish(msg.text) ? "Got the location. What do you have to give, how much and until when?" : "Recibí la ubicación. ¿Qué tienes para donar, cuánto y hasta qué hora?");
  } else if (pin) {
    step("location", "location received but there is no conversation memory to attach it to");
    return finish("Recibí la ubicación. Escríbeme también qué tienes, cuánto y hasta qué hora, con la colonia.");
  }

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
  const fresh = msg.text.trim() || (image ? "(photo without caption)" : "");
  if (!fresh && !pin) { step("ignored", "Empty message."); return trace; }

  // An answer to our last question completes the offer instead of starting over.
  const earlier = conv?.openQuestion ? conv.history.map(t => t.text) : [];
  const text = [...earlier, fresh].filter(Boolean).join("\n");
  // One team-inbox row per offer: follow-up answers update the row the first message opened.
  const opened = earlier.length && conv?.history[0] ? conv.history[0].at : at.toISOString();
  if (earlier.length) step("memory", `continuing the conversation (${earlier.length} earlier message${earlier.length > 1 ? "s" : ""})`);
  const pinOrigin = conv?.pin ? { point: conv.pin.point, label: conv.pin.label, source: "pin" as const } : null;
  const homeOrigin = registered?.location ? { point: registered.location, label: registered.area ?? registered.address ?? registered.name, source: "registro" as const } : null;
  const origin = { ...(pinOrigin ?? homeOrigin ?? {}), donorId: registered?.status === "verified" ? registered.id : null };

  try {
    const r = await processIntake(text, image, ctx.deps, ctx.photoFixture, ctx.source === "web" ? "web" : "whatsapp", origin);
    trace.metaCalls = r.metaCalls;
    const feasible = r.candidates.filter(c => c.feasible).length;
    trace.intake = { provider: r.provider, supply: r.supply, demand: r.demand, condition: r.condition, photo: r.photo, icc: r.icc, feasible, blocked: r.candidates.length - feasible };
    step("interpreted", `${r.provider} · ${r.metaCalls} Meta call(s) · ${r.supply ? "supply offer drafted" : r.demand ? "receiving organization drafted (needs verification)" : "no offer found"}`);
    if (r.supply?.point) step("origin", `pickup point from ${pinOrigin ? "the shared location pin" : "the donor's registration"}`);
    if (r.condition) step("safety", `${r.condition.reason} Routing condition: ${r.condition.effective}.`);
    if (r.icc) { const w = r.icc.physical.weightKg; step("icc", `weight ${w ? `${fmtRange(w.value)} kg · ${w.provenance}` : "unknown"} · condition ${r.icc.quality.condition.value} · ${r.icc.quality.condition.provenance} · missing ${r.icc.missing.map(m => m.field).join(", ") || "nothing"}`); }
    if (r.supply) step("matching", `${feasible} feasible, ${r.candidates.length - feasible} blocked (deterministic gates; nothing booked).`);
    let reply = composeReply(text, r, registered);
    if (r.supply && !registered && store && !earlier.length) reply += looksEnglish(text) ? "\nTip: write \"register\" once so you don't have to repeat your address." : "\nTip: escribe \"registrar\" una vez y ya no tendrás que repetir tu dirección.";
    if (conv) {
      const open = asksSomething(reply) && Boolean(r.supply || r.demand);
      conv.history = open ? [...(conv.openQuestion ? conv.history : []), { text: fresh, at: at.toISOString() }].slice(-MAX_TURNS) : [];
      conv.openQuestion = open;
      if (!open) conv.pin = null;
    }
    if (store && (r.supply || r.demand)) {
      try {
        await store.addInbox({ id: `in-${key}-${opened}`.replace(/[^a-zA-Z0-9-]/g, "-"), at: at.toISOString(), phone, source: ctx.source, kind: r.supply ? "offer" : "need", summary: reply.split("\n")[0].replace(/^¡Gracias! (Registré|Lo anoté): ?/, "").replace(/^Thanks! I noted:? ?/, ""), text, registrationId: registered?.id ?? null, feasible });
      } catch (e) { step("inbox", `Could not save to the team inbox (${e instanceof Error ? e.message : "error"}).`); }
    }
    return finish(reply);
  } catch (e) {
    step("interpreted", `Intake failed (${e instanceof Error ? e.name : "error"}); no retry.`);
    return finish(looksEnglish(text) ? "Thanks, we got your message. A person on our team will follow up." : "Gracias, recibimos tu mensaje. Una persona del equipo te contactará.");
  }
}

const traces: Trace[] = [];
/** In-memory, per server instance, newest first. Enough for a demo; not an audit log. */
export function recordTrace(t: Trace) { traces.unshift(t); traces.length = Math.min(traces.length, 25); }
/** Public view: webhook and web traces come from real people, so their reply text and offer details are withheld. */
export function recentTraces(): Trace[] {
  return traces.map(t => t.source === "simulator" ? t : { ...t, reply: t.reply ? "(withheld: real sender)" : null, intake: t.intake ? { ...t.intake, supply: null, demand: null, photo: null, icc: null } : null });
}
