const navLinks = [
  { label: "Thesis", href: "#thesis" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Demo", href: "#demo" },
  { label: "Story", href: "#story" },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-6 px-6">
        <a href="#top" className="flex shrink-0 items-center" aria-label="GrinFlow home">
          <img src="/grinflow-logo.svg" alt="GrinFlow" className="h-6 w-auto" />
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
            href="#demo"
            className="rounded-md bg-primary px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-85"
          >
            Watch 90-second Demo
          </a>
          <a
            href="#thesis"
            className="hidden rounded-md border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-secondary sm:inline-block"
          >
            Read Product Thesis
          </a>
        </div>
      </div>
    </header>
  )
}
