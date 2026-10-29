const contrasts = [
  { instead: "Instead of replacing WhatsApp,", we: "we structure the communication passing through it." },
  { instead: "Instead of replacing logistics providers,", we: "we coordinate them." },
  { instead: "Instead of replacing operators,", we: "we help them make decisions faster." },
]

export function PhilosophySection() {
  return (
    <section className="border-b border-border bg-secondary">
      <div className="mx-auto max-w-5xl px-6 py-20 md:py-28">
        <h2 className="eyebrow">Product Philosophy</h2>

        <blockquote className="mt-8 max-w-3xl font-display text-3xl leading-[1.15] tracking-tight text-balance md:text-5xl">
          &ldquo;We don&apos;t replace workflows. We make existing workflows intelligent.&rdquo;
        </blockquote>

        <ul className="mt-12 flex max-w-3xl flex-col divide-y divide-border border-y border-border">
          {contrasts.map((item) => (
            <li key={item.instead} className="flex flex-col gap-1 py-5 md:flex-row md:gap-6">
              <span className="text-sm text-muted-foreground md:w-1/2">{item.instead}</span>
              <span className="text-sm md:w-1/2">{item.we}</span>
            </li>
          ))}
        </ul>

        <p className="mt-10 max-w-2xl leading-relaxed text-muted-foreground">
          The infrastructure already exists. We are building the intelligence layer on top.
        </p>
      </div>
    </section>
  )
}
