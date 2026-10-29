const steps = [
  {
    index: "01",
    title: "Passive Ingestion",
    input: "Voice notes, WhatsApp, text messages, and emails",
    output: "Converted into structured operational events without form filling.",
  },
  {
    index: "02",
    title: "Network Understanding",
    input: "Inventory, routes, drivers, weather, and food safety alerts",
    output: "Real-time operational context and bottleneck mapping.",
  },
  {
    index: "03",
    title: "Decision Coordination",
    input: "Instead of dozens of phone calls",
    output: "Operators receive clear, actionable trade-offs to approve with one click.",
  },
]

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="border-b border-border">
      <div className="mx-auto max-w-5xl px-6 py-20 md:py-24">
        <h2 className="eyebrow">How It Works</h2>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((step) => (
            <article key={step.index} className="flex flex-col rounded-md border border-border bg-card p-6">
              <p className="font-mono text-[11px] tracking-[0.02em] text-muted-foreground">
                {step.index} / {step.title}
              </p>
              <p className="mt-5 text-sm leading-relaxed text-card-foreground">{step.input}</p>
              <p aria-hidden="true" className="mt-3 font-mono text-sm text-muted-foreground">
                &darr;
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.output}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
