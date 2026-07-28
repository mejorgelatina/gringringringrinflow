export function HeroSection() {
  return (
    <section id="top" className="border-b border-border">
      <div className="mx-auto max-w-5xl px-6 py-20 md:py-28">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Field research · CDMX / EdoMex
        </p>

        <h1 className="mt-6 max-w-3xl text-4xl leading-[1.05] tracking-tight text-balance md:text-6xl">
          The intelligence layer for food supply chains.
        </h1>

        <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty">
          We expected software to be the bottleneck. We were wrong. GrinFlow turns fragmented operational communication
          into coordinated decisions&mdash;without asking organizations to change how they work.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <a
            href="#demo"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm text-primary-foreground transition-opacity hover:opacity-85"
          >
            Watch 90-second Demo
          </a>
          <a
            href="#thesis"
            className="inline-flex items-center justify-center rounded-md border border-border px-5 py-3 text-sm text-foreground transition-colors hover:bg-secondary"
          >
            Product Overview &amp; Architecture
          </a>
        </div>
      </div>
    </section>
  )
}
