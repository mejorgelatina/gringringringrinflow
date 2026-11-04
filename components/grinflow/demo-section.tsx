const pipeline = ["WhatsApp Input", "Structured JSON Parsing", "Context Engine", "Decision Execution"]

const liveDemos = [
  { href: "/send", title: "Give or receive food (web)", desc: "The web version of the WhatsApp channel: a donor posts food, or an organization says it can receive. Same handler, same replies." },
  { href: "/qr", title: "GrinFlow QR", desc: "Printable codes that open WhatsApp with the first message ready, or the web chat when no number is set." },
  { href: "/demo/flow", title: "Offer to decision", desc: "Missing data, donor confirmation, explained matches, route review and a logged human decision." },
  { href: "/whatsapp", title: "WhatsApp channel", desc: "A donor messages or sends a photo; the same pipeline drafts the offer and replies with one question." },
  { href: "/intake", title: "Message and photo intake", desc: "Structured event with evidence, a photo check that never certifies safety, and an operator review step." },
  { href: "/platform", title: "Operations console", desc: "Offers, recipients, transport, lifecycle and audit log for the network." },
]

export function DemoSection() {
  return (
    <section id="demo" className="border-b border-border">
      <div className="mx-auto max-w-5xl px-6 py-20 md:py-24">
        <h2 className="eyebrow">Product Demo</h2>
        <p className="mt-4 text-2xl tracking-tight md:text-3xl">Demo Video (3 Minutes)</p>

        <div className="mt-8 overflow-hidden rounded-md border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span aria-hidden="true" className="size-2 rounded-full bg-muted-foreground/40" />
            <span aria-hidden="true" className="size-2 rounded-full bg-muted-foreground/40" />
            <span aria-hidden="true" className="size-2 rounded-full bg-muted-foreground/40" />
            <p className="ml-2 font-mono text-[11px] tracking-[0.02em] text-muted-foreground">
              grinflow — demo video
            </p>
          </div>

          {/* H.264/AAC mp4 served from /public so it plays in every browser, with no third-party embed. */}
          <video
            className="aspect-video w-full bg-secondary"
            controls
            playsInline
            preload="metadata"
            aria-label="GrinFlow demo video"
          >
            <source src="/video/grinflow-demo.mp4" type="video/mp4" />
            <a href="/video/grinflow-demo.mp4">Download the GrinFlow demo video</a>
          </video>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {liveDemos.map((demo) => (
            <a
              key={demo.href}
              href={demo.href}
              className="group rounded-md border border-border bg-card p-4 transition-colors hover:border-foreground/40"
            >
              <p className="font-mono text-[11px] tracking-[0.02em] text-muted-foreground">Live demo · synthetic data</p>
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
              <span className="rounded-md border border-dashed border-foreground/30 px-3 py-2 font-mono text-[11px] tracking-[0.02em] text-muted-foreground">
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
