import type { Metadata } from "next"

import { FlowConsole } from "@/components/grinflow/flow-console"

export const metadata: Metadata = {
  title: "GrinFlow — Offer to decision",
  description: "Demo: an offer arrives, missing data is requested, destinations are proposed, and a person decides.",
}

export default function FlowDemoPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 md:py-14">
        <a href="/" className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
          ← GrinFlow
        </a>
        <h1 className="mt-4 text-2xl tracking-tight md:text-3xl">From an offer to a human decision</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          An offer arrives, missing data is identified, the donor is asked to confirm, destinations are proposed, an operator
          verifies the route and decides. Every step is logged. Synthetic data: nothing is stored or sent.
        </p>
        <FlowConsole />
      </div>
    </main>
  )
}
