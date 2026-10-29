import type { Metadata } from "next"

import { StatusPill } from "@/components/grinflow/status-pill"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export const metadata: Metadata = {
  title: "grinflow — design system",
  description: "tokens, type and components used across grinflow.",
}

const greens = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"]
const neutrals = ["ink", "ink-soft", "muted", "subtle", "line", "line-strong", "canvas", "surface", "surface-sunken"]
const typeScale = [
  { token: "4xl", size: "64", use: "hero, desktop", cls: "font-display text-[length:var(--gf-text-4xl)] leading-none" },
  { token: "2xl", size: "32", use: "page title", cls: "font-display text-[length:var(--gf-text-2xl)]" },
  { token: "xl", size: "24", use: "section title", cls: "font-display text-[length:var(--gf-text-xl)]" },
  { token: "lg", size: "18", use: "lede", cls: "text-[length:var(--gf-text-lg)]" },
  { token: "md", size: "15", use: "body", cls: "text-[length:var(--gf-text-md)]" },
  { token: "xs", size: "12", use: "label, meta (mono)", cls: "font-mono text-[length:var(--gf-text-xs)]" },
]

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border py-12">
      <h2 className="eyebrow">{title}</h2>
      {note && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{note}</p>}
      <div className="mt-6">{children}</div>
    </section>
  )
}

export default function DesignSystemPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-6 py-12 md:py-16">
        <a href="/" className="eyebrow hover:text-foreground">← grinflow</a>
        <h1 className="mt-4 text-3xl font-bold md:text-5xl">design system</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          one set of tokens for the site and the ops screens. source: <code>app/tokens.css</code>, notes in{" "}
          <code>docs/design-system.md</code>.
        </p>

        <Section title="logo" note="the grinflow wordmark with its two leaves. the bear belongs to grinpoint, not grinflow.">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex h-36 items-center justify-center rounded-lg border border-border bg-card p-6">
              <img src="/grinflow-logo.svg" alt="grinflow wordmark" className="h-14 w-auto" />
            </div>
            <div className="flex h-36 items-center justify-center rounded-lg bg-accent p-6">
              <img src="/grinflow-logo.svg" alt="grinflow wordmark on pale green" className="h-14 w-auto" />
            </div>
            <div className="flex h-36 items-center justify-center rounded-lg border border-border bg-card p-6">
              <img src="/grinflow-icon.svg" alt="grinflow leaves mark" className="h-12 w-auto" />
            </div>
          </div>
        </Section>

        <Section title="rule: lowercase" note="no uppercase anywhere, including the brand name. the css does it globally; what people type or send keeps its own case (.keep-case).">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-5">
              <StatusPill tone="success">do</StatusPill>
              <p className="mt-3 text-lg">try it on whatsapp</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-5">
              <StatusPill tone="danger">don&apos;t</StatusPill>
              <p className="mt-3 text-lg text-muted-foreground">title case, all caps, or capitalized labels</p>
            </div>
          </div>
        </Section>

        <Section title="color" note="brand green is sampled from the wordmark (#368a62 = green-500). buttons use green-600 so white text passes contrast.">
          <div className="grid grid-cols-5 gap-2 md:grid-cols-10">
            {greens.map((g) => (
              <div key={g}>
                <div className="h-14 rounded-md border border-border" style={{ background: `var(--gf-green-${g})` }} />
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">green-{g}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2 md:grid-cols-9">
            {neutrals.map((n) => (
              <div key={n}>
                <div className="h-14 rounded-md border border-border" style={{ background: `var(--gf-${n})` }} />
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">{n}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="type" note="manrope for display, dm sans for text, dm mono for labels and data.">
          <ul className="flex flex-col divide-y divide-border">
            {typeScale.map((t) => (
              <li key={t.token} className="flex flex-col gap-1 py-4 md:flex-row md:items-baseline md:gap-8">
                <span className="w-40 shrink-0 font-mono text-xs text-muted-foreground">
                  {t.token} · {t.size}px · {t.use}
                </span>
                <span className={t.cls}>food finds where it is needed</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="components">
          <div className="flex flex-wrap items-center gap-3">
            <Button>approve match</Button>
            <Button variant="outline">ask the donor</Button>
            <Button variant="secondary">save draft</Button>
            <Button variant="ghost">skip</Button>
            <Button variant="destructive">reject</Button>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <StatusPill tone="success">delivered</StatusPill>
            <StatusPill tone="info">proposed</StatusPill>
            <StatusPill tone="warn">needs review</StatusPill>
            <StatusPill tone="danger">blocked</StatusPill>
            <StatusPill tone="neutral">draft</StatusPill>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-5 shadow-[var(--gf-shadow-sm)]">
              <p className="eyebrow">offer · gf-1024</p>
              <p className="mt-2 font-display text-lg">20 boxes of bread · roma</p>
              <p className="mt-1 text-sm text-muted-foreground">pickup before 6 pm · condition confirmed by a person</p>
              <div className="mt-4 flex gap-2">
                <Button size="sm">approve</Button>
                <Button size="sm" variant="outline">change</Button>
              </div>
            </div>
            <label className="flex flex-col gap-2 rounded-lg border border-border bg-card p-5 text-sm">
              <span className="text-muted-foreground">donor message (keeps its own case)</span>
              <Input defaultValue="Tenemos 20 cajas de pan en la Roma" />
            </label>
          </div>
        </Section>
      </div>
    </main>
  )
}
