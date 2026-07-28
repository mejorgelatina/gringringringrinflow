const flow = [
  { label: "Expected", body: "Lack of software", state: "rejected" as const },
  { label: "Reality", body: "Coordination friction", state: "rejected" as const },
  { label: "Solution", body: "GrinFlow intelligence layer", state: "kept" as const },
]

export function LearnedSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-20 md:grid-cols-[180px_1fr] md:py-24">
        <div>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">What We Learned</h2>
          <p className="mt-2 text-sm text-muted-foreground">Hypothesis vs. field</p>
        </div>

        <div className="max-w-2xl">
          <figure className="rounded-md border border-dashed border-foreground/30 bg-card p-5">
            <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
              {flow.map((step, i) => (
                <div key={step.label} className="flex flex-1 items-center gap-3">
                  <div
                    className={`flex-1 rounded-md border border-dashed p-4 ${
                      step.state === "kept" ? "border-foreground bg-secondary" : "border-foreground/30"
                    }`}
                  >
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {step.label}
                    </p>
                    <p className="mt-2 flex items-baseline gap-2 text-sm leading-snug text-card-foreground">
                      <span aria-hidden="true" className="font-mono text-muted-foreground">
                        {step.state === "kept" ? "[+]" : "[x]"}
                      </span>
                      {step.body}
                    </p>
                  </div>
                  {i < flow.length - 1 && (
                    <span aria-hidden="true" className="font-mono text-muted-foreground">
                      &rarr;
                    </span>
                  )}
                </div>
              ))}
            </div>
            <figcaption className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Fig. 1 &mdash; Two rejected hypotheses, one observed truth
            </figcaption>
          </figure>

          <p className="mt-8 leading-relaxed text-muted-foreground text-pretty">
            We expected organizations to complain about software. Nobody did. Instead, they complained about waiting for
            calls, tracking down missing drivers, confirming inventory, and searching through dozens of chat threads.
            That observation changed what we decided to build.
          </p>
        </div>
      </div>
    </section>
  )
}
