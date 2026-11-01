import { detectAttributes, placePoint } from "../network/supply.ts"
import type { Point } from "../network/types.ts"
import type { Accepts, Contact, Generates, RegisteredRole, WeeklyHours } from "./types.ts"

// Small deterministic parsers for onboarding answers. No model call: registration must work with Meta off
// and never spend credits. Anything not understood is kept as written for a person to read.

export const norm = (s: string) => s.toLocaleLowerCase("es-MX").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()

export function isYes(text: string): boolean {
  return /^(si|sí|s|ok|va|vale|correcto|claro|de acuerdo|esta bien|todo bien|perfecto|listo|yes|y|acepto|confirmo|👍)\b/.test(norm(text).replace(/[.!¡,]/g, ""))
}
export function isNo(text: string): boolean {
  return /^(no|nel|nop|incorrecto|esta mal|corregir|cambiar)\b/.test(norm(text).replace(/[.!¡,]/g, ""))
}
export function isCancel(text: string): boolean {
  return /^(cancelar|cancela|salir|olvidalo|ya no|stop|cancel)\b/.test(norm(text))
}

/** "quiero registrar mi organización", "registro", "dar de alta", "unirme a grinflow". */
export function wantsToRegister(text: string): boolean {
  const t = norm(text)
  return /\b(registr(ar|o|arme|arnos|ate)|inscribir(me|nos)?|(dar|darnos|darme|damos|dan|doy) de alta|alta en grinflow|unirme|unirnos|sumarnos|sumarme|quiero participar|actualizar (mis|nuestros) datos|cambiar (mis|nuestros) datos|sign ?up|register)\b/.test(t)
}

const ROLE_WORDS: [RegisteredRole, RegExp][] = [
  ["donor", /\b(1|don(o|amos|ar|ante|aciones)|dam(os)?|genero|generamos|sobra|sobrante|merma|restaurante|panaderia|hotel|super(mercado)?|tienda|mercado)\b/],
  ["receiver", /\b(2|recib(o|imos|ir)|comedor|albergue|banco de alimentos|casa hogar|refugio|fundacion|asociacion|necesitamos comida|personas)\b/],
  ["maker", /\b(3|maker|transform(o|amos|ar|acion)|taller|artista|estudio|biomaterial(es)?|material(es)?|prueba|ceramica|tinte|reciclo|reciclamos)\b/],
  ["compost", /\b(4|compost(a|aje|amos)?|lombri|abono)\b/],
]

export function parseRoles(text: string): RegisteredRole[] {
  const t = norm(text)
  return ROLE_WORDS.filter(([, re]) => re.test(t)).map(([r]) => r)
}

const DAYS: [RegExp, number][] = [[/\blun(es)?\b/, 1], [/\bmar(tes)?\b/, 2], [/\bmie(rcoles)?\b/, 3], [/\bjue(ves)?\b/, 4], [/\bvie(rnes)?\b/, 5], [/\bsab(ados?)?\b/, 6], [/\bdom(ingos?)?\b/, 0]]
const ORDER = [1, 2, 3, 4, 5, 6, 0]

function dayRange(a: number, b: number): number[] {
  const i = ORDER.indexOf(a), j = ORDER.indexOf(b)
  return i <= j ? ORDER.slice(i, j + 1) : [...ORDER.slice(i), ...ORDER.slice(0, j + 1)]
}

/** Days and hours from "lunes a viernes de 9 a 6", "todos los días 8:00-14:00", "sábados de 10am a 2pm". */
export function parseHours(text: string): WeeklyHours | null {
  const t = norm(text).replace(/\./g, "")
  let days: number[] = []
  if (/\b(todos los dias|diario|diariamente|toda la semana|lunes a domingo|siempre|24 ?h(oras|rs)?)\b/.test(t)) days = [...ORDER]
  else if (/\bentre semana\b/.test(t)) days = [1, 2, 3, 4, 5]
  else if (/\bfin(es)? de semana\b/.test(t)) days = [6, 0]
  const range = t.match(/\b(lun|mar|mie|jue|vie|sab|dom)[a-z]* (?:a|al|-) (lun|mar|mie|jue|vie|sab|dom)[a-z]*/)
  if (!days.length && range) {
    const a = DAYS.find(([re]) => re.test(range[1]))![1], b = DAYS.find(([re]) => re.test(range[2]))![1]
    days = dayRange(a, b)
  }
  if (!days.length) days = DAYS.filter(([re]) => re.test(t)).map(([, d]) => d)
  if (/\b24 ?h(oras|rs)?\b/.test(t)) return { days: days.length ? days : [...ORDER], from: 0, to: 24 * 60 }
  const times = [...t.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a m|p m|hrs|hr|h)?\b/g)]
    .map((m) => ({ h: Number(m[1]), m: Number(m[2] ?? 0), suffix: (m[3] ?? "").replace(" ", "") }))
    .filter((x) => x.h <= 24 && x.m < 60)
  if (times.length < 2) return null
  const [a, b] = times
  const toMin = (x: { h: number; m: number; suffix: string }) => ((x.suffix === "pm" && x.h < 12 ? x.h + 12 : x.suffix === "am" && x.h === 12 ? 0 : x.h) * 60 + x.m)
  const from = toMin(a)
  let to = toMin(b)
  // "de 9 a 6" means 9:00 to 18:00.
  if (to <= from && !b.suffix && b.h < 12) to += 12 * 60
  if (to <= from) return null
  return { days: days.length ? days : [1, 2, 3, 4, 5, 6], from, to: Math.min(to, 24 * 60) }
}

const DAY_ES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]
export function hoursLabel(h: WeeklyHours | null, raw = ""): string {
  if (!h) return raw || "sin horario"
  const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
  const sorted = ORDER.filter((d) => h.days.includes(d))
  const set = sorted.join(",")
  const days = sorted.length === 7 ? "todos los días" : set === "1,2,3,4,5" ? "lunes a viernes" : set === "1,2,3,4,5,6" ? "lunes a sábado" : sorted.map((d) => DAY_ES[d]).join(", ")
  return `${days} de ${clock(h.from)} a ${clock(h.to)}`
}

const PHONE = /(\+?\d[\d\s().-]{7,}\d)/

/** "Juan Pérez 55 1234 5678", "yo, Ana", "Mariana (coordinadora) 5512345678". The sender's number is the default. */
export function parseContact(text: string, senderPhone: string): Contact | null {
  const phoneMatch = text.match(PHONE)
  const phone = phoneMatch ? phoneMatch[1].replace(/\D/g, "") : senderPhone.replace(/\D/g, "")
  let name = (phoneMatch ? text.replace(phoneMatch[1], " ") : text)
    .replace(/\b(soy|yo|es|se llama|contacto|nombre|tel(efono)?|cel(ular)?|whatsapp|mi numero|este numero|este mismo|el mismo|mismo numero)\b[:,]?/gi, " ")
    .replace(/[,;:]+/g, " ").replace(/\s+/g, " ").trim()
  if (name.length > 80) name = name.slice(0, 80)
  if (!name) return null
  return { name, phone }
}

const CATEGORY_WORDS: [string, RegExp][] = [
  ["panificados", /\b(pan|panes|panaderia|reposteria|pasteles?|galletas?|tortillas?)\b/],
  ["verduras", /\b(verduras?|legumbres?|hortalizas?|vegetales?)\b/],
  ["frutas", /\b(frutas?)\b/],
  ["lacteos", /\b(lacteos?|leche|yogurt?|yogures|quesos?)\b/],
  ["abarrotes", /\b(abarrotes?|enlatados?|latas|despensa|arroz|frijol(es)?|granos?|pasta|cereal(es)?|no perecederos?)\b/],
  ["proteina", /\b(carnes?|pollo|pescado|huevos?|proteinas?)\b/],
  ["organico", /\b(organico|organicos|cascaras?|residuos?|composta|restos|desechos? organicos?)\b/],
]
export const CATEGORY_ES: Record<string, string> = { panificados: "pan", verduras: "verdura", frutas: "fruta", lacteos: "lácteos", abarrotes: "abarrotes", proteina: "proteína", organico: "orgánico" }
const ALL_FOOD = ["panificados", "verduras", "frutas", "lacteos", "abarrotes", "proteina"]

export function parseCategories(text: string): string[] {
  const t = norm(text)
  if (/\b(todo|de todo|cualquier (cosa|alimento|comida)|lo que sea|toda clase)\b/.test(t)) return [...ALL_FOOD]
  return CATEGORY_WORDS.filter(([, re]) => re.test(t)).map(([c]) => c)
}

/** "30 kg", "unos 50 kilos", "100 kg por semana", "una tonelada". */
export function parseKg(text: string): number | null {
  const t = norm(text)
  if (/\b(una|1) tonelada\b/.test(t)) return 1000
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilos?|kilogramos?|k)\b/)
  return m ? Number(m[1].replace(",", ".")) : null
}

const MATERIALS = ["cáscara de huevo", "cáscara de cebolla", "cáscara de naranja", "cáscara de plátano", "hueso de aguacate", "borra de café", "pan duro", "aceite de cocina usado", "bagazo", "posos de café"]

export function parseAccepts(text: string, roles: string[]): Accepts {
  const t = norm(text)
  const materials = roles.includes("maker") ? MATERIALS.filter((m) => t.includes(norm(m))) : []
  if (roles.includes("maker") && !materials.length && /\bcascara\b/.test(t) && /\bhuevo\b/.test(t)) materials.push("cáscara de huevo")
  let categories = parseCategories(text)
  if (roles.includes("compost") && !roles.includes("receiver")) categories = [...new Set(["organico", ...categories])]
  if (roles.includes("maker") && !roles.includes("receiver")) categories = [...new Set(["organico", ...categories.filter((c) => c === "organico")])]
  return { categories, materials, requires: detectAttributes(text), weeklyKg: parseKg(text), text: text.trim().slice(0, 300) }
}

export function parseGenerates(text: string): Generates {
  const t = norm(text)
  const frequency = /\b(diari[oa]|todos los dias|cada dia|diariamente)\b/.test(t) ? "diaria" : /\b(semana|semanal|semanalmente|cada (lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/.test(t) ? "semanal" : /\b(a veces|eventual|de vez en cuando|ocasional)\b/.test(t) ? "eventual" : null
  return { categories: parseCategories(text), kgPerWeek: parseKg(text), frequency, text: text.trim().slice(0, 300) }
}

export function parsePickup(text: string): boolean | null {
  const t = norm(text)
  if (/\b(uber|envio|envien|mandamos|mandar|no podemos|no tenemos|nos lo traen|que nos lo lleven|necesitamos que)\b/.test(t)) return false
  if (/\b(recogemos|pasamos|vamos|tenemos (camioneta|carro|auto|vehiculo|coche)|si podemos|nosotros)\b/.test(t) || isYes(text)) return true
  if (isNo(text)) return false
  return null
}

/** A typed address: keep it as written; place it only if it names a pilot colonia. */
export function parseAddress(text: string): { address: string; point: Point | null; area: string | null } {
  const address = text.trim().slice(0, 200)
  const t = norm(address)
  const colonia = ["roma norte", "roma sur", "roma", "condesa", "centro", "doctores", "juarez", "narvarte", "del valle", "guerrero"].find((c) => t.includes(c)) ?? null
  return { address, point: colonia ? placePoint(colonia) : null, area: colonia }
}
