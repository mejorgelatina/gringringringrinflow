const navLinks = [
  { label: "thesis", href: "#thesis" },
  { label: "how it works", href: "#how-it-works" },
  { label: "demo", href: "#demo" },
  { label: "story", href: "#story" },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-6 px-6">
        <a href="#top" className="flex shrink-0 items-center" aria-label="grinflow home">
          <img src="/grinflow-logo.svg" alt="grinflow" className="h-7 w-auto" />
        </a>

        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="/send"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-700"
          >
            give or receive food
          </a>
          <a
            href="#demo"
            className="hidden rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-secondary sm:inline-block"
          >
            watch the demo
          </a>
        </div>
      </div>
    </header>
  )
}
