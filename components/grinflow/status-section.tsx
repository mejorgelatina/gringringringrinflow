const items = [
  { state: "Completed", label: "WhatsApp → Structured Operational Data Pipeline" },
  { state: "Completed", label: "Decision Trade-off Matrix Engine" },
  { state: "In Progress", label: "Pilot Partner Onboarding (CDMX / EdoMex)" },
  { state: "In Progress", label: "Coordination Network Scale" },
]

export function StatusSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-5xl px-6 py-20 md:py-24">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Current Status</h2>

        <ul className="mt-8 grid gap-3 md:grid-cols-2">
          {items.map((item) => {
            const done = item.state === "Completed"
            return (
              <li
                key={item.label}
                className="flex items-start gap-4 rounded-md border border-border bg-card p-5"
              >
                <span
                  className={`shrink-0 rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
                    done ? "bg-primary text-primary-foreground" : "border border-dashed border-foreground/40 text-muted-foreground"
                  }`}
                >
                  {done ? "done" : "wip"}
                </span>
                <span className="text-sm leading-relaxed text-card-foreground">{item.label}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
