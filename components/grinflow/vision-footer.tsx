const footerLinks = ["Looking for Pilot Partners", "Early Design Partners", "Exceptional Engineers"]

export function VisionFooter() {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="mx-auto max-w-5xl px-6 py-20 md:py-24">
        <p className="max-w-3xl font-display text-2xl leading-[1.25] tracking-tight text-balance md:text-4xl">
          We believe the future of logistics won&apos;t be another ERP. It will be an intelligence layer coordinating the
          infrastructure that already exists.
        </p>

        <div className="mt-14 flex flex-col gap-8 border-t border-primary-foreground/15 pt-8 md:flex-row md:items-center md:justify-between">
          <nav aria-label="Footer" className="flex flex-col gap-3 md:flex-row md:gap-8">
            {footerLinks.map((link) => (
              <a
                key={link}
                href="mailto:hello@grinflow.com"
                className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary-foreground/70 transition-colors hover:text-primary-foreground"
              >
                {link}
              </a>
            ))}
          </nav>

          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary-foreground/50">
            © 2026 GrinFlow. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
