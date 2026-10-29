const waysIn = ["write a message", "send a photo", "scan the grinflow qr"]

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
              <li
                key={way}
                className="rounded-full border border-border bg-card px-3 py-1.5 font-mono text-xs text-muted-foreground"
              >
                {way}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="/whatsapp"
              className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-700"
            >
              try it on whatsapp
            </a>
            <a
              href="#demo"
              className="inline-flex items-center justify-center rounded-md border border-border bg-card px-5 py-3 text-sm text-foreground transition-colors hover:bg-secondary"
            >
              watch the 90-second demo
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
