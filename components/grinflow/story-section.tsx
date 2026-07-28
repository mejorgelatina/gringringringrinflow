export function StorySection() {
  return (
    <section id="story" className="border-b border-border">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-20 md:grid-cols-[180px_1fr] md:py-24">
        <div>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Why We Started</h2>
          <p className="mt-2 text-sm text-muted-foreground">Founder&apos;s note</p>
        </div>

        <div className="flex max-w-2xl flex-col gap-5 leading-relaxed text-muted-foreground">
          <p className="text-xl leading-relaxed text-foreground text-pretty md:text-2xl">
            We didn&apos;t start by building GrinFlow. We started trying to rescue food.
          </p>
          <p>Then we built a matching marketplace. Then a logistics optimizer.</p>
          <p>Reality rejected every one of those initial hypotheses.</p>
          <p>
            So we stopped designing software from an office and started observing operations in the field. Every time our
            hypothesis conflicted with what we observed, we changed the product instead of trying to change reality.
          </p>
        </div>
      </div>
    </section>
  )
}
