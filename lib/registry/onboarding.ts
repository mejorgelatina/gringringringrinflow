import { hoursLabel, isCancel, isNo, isYes, parseAccepts, parseAddress, parseContact, parseGenerates, parseHours, parsePickup, parseRoles } from "./parse.ts"
import { acceptsCore } from "./display.ts"
import type { Point } from "../network/types.ts"
import type { OnboardingState, OnboardingStep, RegisteredRole, Registration } from "./types.ts"

// Onboarding as a short whatsapp conversation: one question per message, in the order a coordinator would
// ask on the phone. Each answer is parsed deterministically; what can't be parsed is kept as written and the
// team sees it. The result is a registration "pendiente de verificación": nothing enters the network until a
// person verifies it in /team.

export type OnboardingInput = { text: string; pin?: { point: Point; label: string } | null }
export type OnboardingOutcome = { state: OnboardingState | null; reply: string; completed?: Registration; cancelled?: boolean }

const ROLE_LABEL: Record<RegisteredRole, string> = { donor: "dona alimento o material", receiver: "recibe alimento para personas", maker: "transforma materiales (maker)", compost: "hace composta" }
const destination = (roles: RegisteredRole[]) => roles.some((r) => r !== "donor")

const Q: Record<OnboardingStep, (s: OnboardingState) => string> = {
  role: () => "¡Va! Te registro en 2 minutos. ¿Qué hace tu organización? Puedes elegir varias:\n1. dona alimento o material que le sobra\n2. recibe alimento para personas (comedor, albergue, banco)\n3. transforma materiales (taller, artista, maker)\n4. hace composta\nEscribe \"cancelar\" cuando quieras salir.",
  name: () => "¿Cómo se llama el establecimiento u organización?",
  location: () => "¿Dónde están? Mándame la ubicación (📎 → ubicación) o escribe la dirección con calle, número y colonia.",
  hours: (s) => (s.draft.roles?.includes("donor") && !destination(s.draft.roles ?? [])
    ? "¿En qué días y horario se puede pasar a recoger? Por ejemplo: lunes a sábado de 9 a 6."
    : "¿En qué días y horario pueden recibir? Por ejemplo: lunes a viernes de 10 a 5."),
  contact: () => "¿Quién es la persona de contacto? Nombre y, si es otro número, su teléfono.",
  accepts: (s) => (s.draft.roles?.includes("maker") && !s.draft.roles?.includes("receiver")
    ? "¿Qué material usan, en qué estado lo necesitan (limpio, seco, molido, separado) y cuánto por semana, aproximadamente?"
    : s.draft.roles?.includes("compost") && !s.draft.roles?.includes("receiver")
      ? "¿Qué reciben para composta y cuántos kilos por semana, aproximadamente?"
      : "¿Qué alimentos pueden recibir y cuánto por semana, aproximadamente? Por ejemplo: pan, fruta y verdura, unos 100 kg."),
  pickup: () => "¿Pueden pasar a recoger con su gente o vehículo? Si no, pueden mandar su propio envío (un uber) y lo pagan ustedes. Responde \"recogemos\" o \"mandamos uber\".",
  generates: () => "¿Qué les sobra normalmente, cuánto y cada cuándo? Por ejemplo: pan del día, unos 20 kg, diario.",
  confirm: (s) => `${summary(s.draft)}\n\n¿Está todo bien? Si respondes \"sí\" aceptas que grinflow te escriba por WhatsApp con ofertas y avisos. Responde \"no\" para empezar de nuevo.`,
}

export function summary(d: Partial<Registration>): string {
  const lines = [
    `• ${d.name ?? "—"}`,
    `• ${(d.roles ?? []).map((r) => ROLE_LABEL[r]).join(", ") || "—"}`,
    `• ${d.address ?? "sin dirección"}${d.locationSource === "pin" ? " (ubicación compartida)" : d.location ? "" : " (el equipo la ubica)"}`,
    `• ${hoursLabel(d.hours ?? null, d.hoursText)}`,
    `• contacto: ${(d.contacts ?? []).map((c) => `${c.name} ${c.phone}`).join(", ") || "—"}`,
  ]
  if (d.accepts) lines.push(`• ${(d.roles?.includes("maker") && d.accepts.materials.length ? "material: " : "recibe: ") + acceptsCore(d.accepts, { maker: d.roles?.includes("maker") ?? false })}${d.accepts.weeklyKg ? `, ~${d.accepts.weeklyKg} kg/semana` : ""}`)
  if (d.selfPickup !== undefined && d.selfPickup !== null) lines.push(`• ${d.selfPickup ? "recogen con su gente" : "mandan su propio envío"}`)
  if (d.generates) lines.push(`• les sobra: ${d.generates.text}`)
  return `Esto es lo que registré:\n${lines.join("\n")}`
}

function next(step: OnboardingStep, roles: RegisteredRole[]): OnboardingStep {
  const order: OnboardingStep[] = ["role", "name", "location", "hours", "contact"]
  if (destination(roles)) order.push("accepts")
  if (roles.includes("receiver") || roles.includes("maker")) order.push("pickup")
  if (roles.includes("donor")) order.push("generates")
  order.push("confirm")
  return order[order.indexOf(step) + 1] ?? "confirm"
}

export function startOnboarding(now: Date, existing: Registration | null = null): OnboardingOutcome {
  const state: OnboardingState = { step: "role", draft: {}, editingId: existing?.id ?? null, startedAt: now.toISOString() }
  const intro = existing ? `Ya tengo registrada a ${existing.name}. Vamos a actualizar sus datos.\n\n` : ""
  return { state, reply: intro + Q.role(state) }
}

let counter = 0
const newId = (now: Date) => `reg-${now.getTime().toString(36)}${(counter++ % 1296).toString(36).padStart(2, "0")}`

/** One answer in, the next question (or the finished registration) out. */
export function continueOnboarding(state: OnboardingState, input: OnboardingInput, ctx: { phone: string; source: Registration["source"]; now: Date }): OnboardingOutcome {
  const text = input.text.trim()
  if (isCancel(text)) return { state: null, reply: "Listo, cancelé el registro. Cuando quieras retomarlo escribe \"registrar\".", cancelled: true }
  const s: OnboardingState = structuredClone(state)
  const d = s.draft
  const ask = (again?: string): OnboardingOutcome => ({ state: s, reply: again ? `${again}\n${Q[s.step](s)}` : Q[s.step](s) })
  const advance = (): OnboardingOutcome => { s.step = next(s.step, d.roles ?? []); return ask() }

  switch (s.step) {
    case "role": {
      const roles = parseRoles(text)
      if (!roles.length) return { state: s, reply: "No entendí. Responde con el número o los números: 1 dona, 2 recibe para personas, 3 transforma materiales, 4 composta." }
      d.roles = roles
      return advance()
    }
    case "name": {
      if (text.length < 2) return ask()
      d.name = text.replace(/^(se llama|somos|es|nombre:?)\s+/i, "").slice(0, 120)
      return advance()
    }
    case "location": {
      if (input.pin) {
        d.location = input.pin.point; d.locationSource = "pin"; d.address = input.pin.label || "ubicación compartida"
        d.area = parseAddress(input.pin.label ?? "").area
        return advance()
      }
      if (text.length < 4) return ask("Necesito la dirección o la ubicación.")
      const a = parseAddress(text)
      d.address = a.address; d.location = a.point; d.locationSource = a.point ? "colonia" : null; d.area = a.area
      return advance()
    }
    case "hours": {
      d.hoursText = text.slice(0, 200)
      d.hours = parseHours(text)
      if (!d.hours && !/\d/.test(text)) return ask("No encontré el horario.")
      return advance()
    }
    case "contact": {
      const c = parseContact(text, ctx.phone)
      if (!c) return ask("Necesito al menos un nombre.")
      d.contacts = [c]
      return advance()
    }
    case "accepts": {
      d.accepts = parseAccepts(text, d.roles ?? [])
      return advance()
    }
    case "pickup": {
      const p = parsePickup(text)
      if (p === null) return ask("No entendí.")
      d.selfPickup = p
      return advance()
    }
    case "generates": {
      d.generates = parseGenerates(text)
      return advance()
    }
    case "confirm": {
      if (isNo(text)) { const again = startOnboarding(ctx.now); return { state: { ...again.state!, editingId: s.editingId }, reply: `Va, empecemos de nuevo.\n\n${Q.role(s)}` } }
      if (!isYes(text)) return ask("Responde \"sí\" o \"no\".")
      const at = ctx.now.toISOString()
      const completed: Registration = {
        id: s.editingId ?? newId(ctx.now),
        phone: ctx.phone.replace(/\D/g, ""),
        ownerUid: null,
        source: ctx.source,
        name: d.name ?? "sin nombre",
        roles: d.roles ?? [],
        address: d.address ?? null,
        location: d.location ?? null,
        locationSource: d.locationSource ?? null,
        area: d.area ?? null,
        hours: d.hours ?? null,
        hoursText: d.hoursText ?? "",
        contacts: d.contacts ?? [],
        accepts: d.accepts ?? null,
        generates: d.generates ?? null,
        selfPickup: d.selfPickup ?? null,
        whatsappOptIn: true,
        status: "pending",
        createdAt: at,
        updatedAt: at,
        verifiedAt: null,
        verifiedBy: null,
        notes: null,
      }
      const after = completed.roles.includes("donor")
        ? "Mientras tanto ya puedes mandarme lo que te sobre: qué es, cuánto y hasta qué hora, o una foto. Ya sé dónde estás."
        : "En cuanto te verifiquemos te empiezan a llegar avisos cuando haya algo que te sirva."
      return { state: null, completed, reply: `¡Listo! Quedó registrado. Una persona del equipo grinflow lo verifica antes de que entres a la red.\n${after}` }
    }
  }
}
