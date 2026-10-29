import type { Metadata } from "next"

import { WebChat } from "@/components/grinflow/web-chat"
import { whatsappLink, whatsappNumber, type Intent, type Lang } from "@/lib/channel/whatsapp-link"

export const metadata: Metadata = {
  title: "grinflow — give or receive food",
  description: "write to grinflow here or on whatsapp: post food that is available, or say your organization can receive food.",
}
export const dynamic = "force-dynamic"

export default async function SendPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const intent: Intent | null = params.intent === "give" || params.intent === "receive" ? params.intent : null
  const lang: Lang = params.lang === "en" ? "en" : "es"
  const number = whatsappNumber()
  const whatsapp = number ? { give: whatsappLink(number, "give", lang), receive: whatsappLink(number, "receive", lang) } : null

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 md:py-14">
        <a href="/" className="inline-block" aria-label="grinflow home">
          <img src="/grinflow-logo.svg" alt="grinflow" className="h-7 w-auto" />
        </a>
        <h1 className="mt-8 text-3xl font-bold md:text-4xl">give or receive food</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          this works the same as writing to grinflow on whatsapp. tell us what food you have, or what your organization can
          receive. you can also send a photo.
        </p>
        <div className="mt-8">
          <WebChat initialIntent={intent} initialLang={lang} whatsapp={whatsapp} />
        </div>
      </div>
    </main>
  )
}
