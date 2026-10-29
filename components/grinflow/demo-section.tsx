const pipeline = ["WhatsApp Input", "Structured JSON Parsing", "Context Engine", "Decision Execution"]

const liveDemos = [
  { href: "/demo/flow", title: "Offer to decision", desc: "Missing data, donor confirmation, explained matches, route review and a logged human decision." },
  { href: "/whatsapp", title: "WhatsApp channel", desc: "A donor messages or sends a photo; the same pipeline drafts the offer and replies with one question." },
  { href: "/intake", title: "Message and photo intake", desc: "Structured event with evidence, a photo check that never certifies safety, and an operator review step." },
  { href: "/platform", title: "Operations console", desc: "Offers, recipients, transport, lifecycle and audit log for the network." },
]

export function DemoSection() {
  return (
    <section id="demo" className="border-b border-border">
      <div className="mx-auto max-w-5xl px-6 py-20 md:py-24">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Product Demo</h2>
        <p className="mt-4 text-2xl tracking-tight md:text-3xl">90-Second MVP Demonstration</p>

        <div className="mt-8 overflow-hidden rounded-md border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span aria-hidden="true" className="size-2 rounded-full bg-muted-foreground/40" />
            <span aria-hidden="true" className="size-2 rounded-full bg-muted-foreground/40" />
            <span aria-hidden="true" className="size-2 rounded-full bg-muted-foreground/40" />
            <p className="ml-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              grinflow — mvp walkthrough
            </p>
          </div>

          <div className="flex aspect-video flex-col items-center justify-center gap-4 bg-secondary px-6 text-center">
            <span
              aria-hidden="true"
              className="flex size-14 items-center justify-center rounded-full border border-foreground/30"
            >
              <svg viewBox="0 0 24 24" className="size-5 translate-x-px fill-foreground">
                <path d="M8 5.5v13l11-6.5-11-6.5z" />
              </svg>
            </span>
            <p className="text-sm text-muted-foreground">Loom recording embed placeholder</p>
            <p className="max-w-md font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Replace this container with the demo iframe
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {liveDemos.map((demo) => (
            <a
              key={demo.href}
              href={demo.href}
              className="group rounded-md border border-border bg-card p-4 transition-colors hover:border-foreground/40"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Live demo · synthetic data</p>
              <p className="mt-2 text-base">
                {demo.title} <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-0.5">&rarr;</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{demo.desc}</p>
            </a>
          ))}
        </div>

        <ol className="mt-8 flex flex-col gap-3 md:flex-row md:items-center">
          {pipeline.map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              <span className="rounded-md border border-dashed border-foreground/30 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {step}
              </span>
              {i < pipeline.length - 1 && (
                <span aria-hidden="true" className="font-mono text-muted-foreground">
                  &rarr;
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
