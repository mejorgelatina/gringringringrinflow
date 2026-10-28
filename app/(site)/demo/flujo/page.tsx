import type { Metadata } from "next"

import { FlowConsole } from "@/components/grinflow/flow-console"

export const metadata: Metadata = {
  title: "GrinFlow — Flujo de una oferta",
  description: "Demo: llega una oferta, se piden los datos que faltan, se proponen destinos y una persona decide.",
}

export default function FlowDemoPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 md:py-14">
        <a href="/" className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
          ← GrinFlow
        </a>
        <h1 className="mt-4 text-2xl tracking-tight md:text-3xl">Flujo de una oferta</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Llega una oferta, se identifican los datos faltantes, se pide confirmación al donante, se proponen destinos y una
          persona operadora decide. Todo queda registrado. Datos sintéticos: nada se guarda ni se envía.
        </p>
        <FlowConsole />
      </div>
    </main>
  )
}
