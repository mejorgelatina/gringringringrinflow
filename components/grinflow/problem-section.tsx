const hidingPlaces = [
  "Fragmented WhatsApp voice notes",
  "Direct phone calls",
  "Human memory",
  "Informal spreadsheets",
]

export function ProblemSection() {
  return (
    <section id="thesis" className="border-b border-border">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-20 md:grid-cols-[180px_1fr] md:py-24">
        <div>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">The Problem</h2>
          <p className="mt-2 text-sm text-muted-foreground">Field observations</p>
        </div>

        <div className="max-w-2xl">
          <p className="text-xl leading-relaxed text-pretty md:text-2xl">
            Food doesn&apos;t go to waste because organizations lack software.
          </p>

          <div className="mt-6 flex flex-col gap-5 leading-relaxed text-muted-foreground">
            <p>
              Every organization we visited in Mexico City and the State of Mexico already had trucks, warehouses,
              inventory systems, and people working incredibly hard.
            </p>
            <p>Yet good food was still being discarded. We kept asking why.</p>
            <p>
              Eventually, we realized we weren&apos;t observing a software problem&mdash;we were observing a
              coordination problem.
            </p>
          </div>

          <div className="mt-8 rounded-md border border-border bg-card p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Critical decisions lived inside
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {hidingPlaces.map((item) => (
                <li key={item} className="flex items-baseline gap-3 text-sm text-card-foreground">
                  <span aria-hidden="true" className="font-mono text-muted-foreground">
                    &mdash;
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-8 text-lg leading-relaxed">No single person had the full picture.</p>
        </div>
      </div>
    </section>
  )
}
