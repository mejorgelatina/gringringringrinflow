import type { Metadata } from "next"
import { headers } from "next/headers"
import QRCode from "qrcode"

import { PrintButton } from "@/components/grinflow/print-button"
import { whatsappLink, whatsappNumber, type Intent, type Lang } from "@/lib/channel/whatsapp-link"

export const metadata: Metadata = {
  title: "grinflow — qr",
  description: "scan to give food or to say your organization can receive food.",
}
export const dynamic = "force-dynamic"

const COPY = {
  es: {
    title: "escanea y escríbele a grinflow",
    lede: "imprime estos códigos y pégalos donde haya comida que se puede rescatar o donde se pueda recibir.",
    give: "tengo comida para donar",
    receive: "mi organización puede recibir comida",
    viaWhatsapp: "abre whatsapp con el mensaje listo",
    viaWeb: "abre el chat de grinflow en el navegador",
    orWeb: "sin whatsapp: entra a",
    print: "imprimir",
    noNumber: "todavía no hay número de whatsapp configurado, así que estos qr abren el chat web, que funciona igual. para que abran whatsapp, define",
  },
  en: {
    title: "scan and write to grinflow",
    lede: "print these codes and put them where there is food to rescue, or where food can be received.",
    give: "i have food to give",
    receive: "my organization can receive food",
    viaWhatsapp: "opens whatsapp with the message ready",
    viaWeb: "opens the grinflow chat in the browser",
    orWeb: "no whatsapp? go to",
    print: "print",
    noNumber: "no whatsapp number is configured yet, so these codes open the web chat, which works the same. to make them open whatsapp, set",
  },
} as const

function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#10211d", light: "#ffffff" } })
}

export default async function QrPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lang: Lang = (await searchParams).lang === "en" ? "en" : "es"
  const t = COPY[lang]
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`
  const number = whatsappNumber()
  const webUrl = (intent: Intent) => `${origin}/send?intent=${intent}&lang=${lang}`

  const cards = await Promise.all(
    (["give", "receive"] as const).map(async (intent) => {
      const target = number ? whatsappLink(number, intent, lang) : webUrl(intent)
      return { intent, target, svg: await qrSvg(target) }
    }),
  )

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 md:py-14">
        <div className="flex items-center justify-between gap-4 print:hidden">
          <a href="/" aria-label="grinflow home">
            <img src="/grinflow-logo.svg" alt="grinflow" className="h-7 w-auto" />
          </a>
          <div className="flex items-center gap-3 text-sm">
            <a href={`/qr?lang=${lang === "es" ? "en" : "es"}`} className="text-muted-foreground hover:text-foreground">
              {lang === "es" ? "english" : "español"}
            </a>
            <PrintButton label={t.print} />
          </div>
        </div>
        <h1 className="mt-8 text-3xl font-bold md:text-4xl print:mt-0">{t.title}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t.lede}</p>
        {!number && <p className="mt-4 max-w-2xl rounded-md bg-[var(--gf-warn-bg)] px-4 py-3 text-sm text-[var(--gf-warn)] print:hidden">{t.noNumber} <code>GRINFLOW_WHATSAPP_NUMBER</code>.</p>}

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {cards.map((c) => (
            <section key={c.intent} className="flex flex-col items-center rounded-lg border border-border bg-card p-8 text-center break-inside-avoid">
              <img src="/grinflow-logo.svg" alt="grinflow" className="h-8 w-auto" />
              <p className="mt-5 font-display text-2xl">{c.intent === "give" ? t.give : t.receive}</p>
              <div className="mt-5 w-56 max-w-full" aria-label={`qr: ${c.target}`} dangerouslySetInnerHTML={{ __html: c.svg }} />
              <p className="mt-4 text-sm text-muted-foreground">{number ? t.viaWhatsapp : t.viaWeb}</p>
              {number && (
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {t.orWeb} {origin.replace(/^https?:\/\//, "")}/send
                </p>
              )}
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
