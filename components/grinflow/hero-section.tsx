const waysIn = [
  { label: "write a message", href: "/send" },
  { label: "send a photo", href: "/send" },
  { label: "scan the grinflow qr", href: "/qr" },
]

const sides = [
  { title: "i have food to give", body: "post food that is available: what it is, how much, where, and until when." },
  { title: "my organization can receive food", body: "say what you can take, how much, and when you can receive it." },
]

export function HeroSection() {
  return (
    <section id="top" className="border-b border-border">
      <div className="mx-auto grid max-w-5xl gap-12 px-6 py-20 md:grid-cols-[1.25fr_1fr] md:items-center md:py-28">
        <div>
          <p className="eyebrow">food rescue · cdmx / edomex</p>

          <h1 className="mt-6 max-w-3xl text-4xl leading-[1.02] font-bold text-balance md:text-6xl">
            send it on whatsapp. <span className="text-primary">grinflow handles the rest.</span>
          </h1>

          <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
            a donor writes or sends a photo to grinflow on whatsapp, or scans the grinflow qr, to post food that is
            available or to say their organization can receive food. either way, grinflow handles the rest.
          </p>

          <ul className="mt-6 flex flex-wrap gap-2" aria-label="ways to reach grinflow">
            {waysIn.map((way) => (
              <li key={way.label}>
                <a
                  href={way.href}
                  className="inline-block rounded-full border border-border bg-card px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  {way.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="/send"
              className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-700"
            >
              give or receive food
            </a>
            <a
              href="/qr"
              className="inline-flex items-center justify-center rounded-md border border-border bg-card px-5 py-3 text-sm text-foreground transition-colors hover:bg-secondary"
            >
              get the grinflow qr
            </a>
            <a href="#demo" className="px-2 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground">
              watch the demo →
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {sides.map((side) => (
            <div key={side.title} className="rounded-lg border border-border bg-card p-5 shadow-[var(--gf-shadow-sm)]">
              <p className="font-display text-lg">{side.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{side.body}</p>
            </div>
          ))}
          <a
            href="/send?intent=register"
            className="group rounded-lg border border-border bg-card p-5 shadow-[var(--gf-shadow-sm)] transition-colors hover:border-primary"
          >
            <p className="font-display text-lg">mi taller o laboratorio puede transformar desechos orgánicos</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              ej. cáscara de huevo: di qué desechos aceptas y grinflow te conecta con quien los genera.{" "}
              <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
            </p>
          </a>
          <div className="rounded-lg bg-accent p-5 text-accent-foreground">
            <p className="font-display text-lg">grinflow handles the rest</p>
            <p className="mt-1 text-sm leading-relaxed">
              it structures the message, asks only what is missing, proposes where the food can go, and a person
              approves before anything moves.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
