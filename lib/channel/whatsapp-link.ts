/** Prefilled first messages for the qr, the "open in whatsapp" buttons and the web chat. */
export const OPENERS = {
  es: { give: "Hola grinflow, tengo comida para donar", receive: "Hola grinflow, mi organización puede recibir comida" },
  en: { give: "Hi grinflow, I have food to give", receive: "Hi grinflow, my organization can receive food" },
} as const
export type Lang = keyof typeof OPENERS
export type Intent = keyof (typeof OPENERS)["es"]

/** GRINFLOW_WHATSAPP_NUMBER is the public business number in international format, digits only (e.g. 5215512345678). */
export function whatsappNumber(): string | null {
  const digits = (process.env.GRINFLOW_WHATSAPP_NUMBER ?? "").replace(/\D/g, "")
  return digits.length >= 8 ? digits : null
}

export function whatsappLink(number: string, intent: Intent, lang: Lang = "es"): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(OPENERS[lang][intent])}`
}
