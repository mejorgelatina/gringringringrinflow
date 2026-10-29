import { cn } from "@/lib/utils"

export type StatusTone = "success" | "warn" | "danger" | "info" | "neutral"

const toneClass: Record<StatusTone, string> = {
  success: "bg-[var(--gf-success-bg)] text-[var(--gf-success)]",
  warn: "bg-[var(--gf-warn-bg)] text-[var(--gf-warn)]",
  danger: "bg-[var(--gf-danger-bg)] text-[var(--gf-danger)]",
  info: "bg-[var(--gf-info-bg)] text-[var(--gf-info)]",
  neutral: "bg-muted text-muted-foreground",
}

/** small lowercase state label, e.g. "done", "needs review", "blocked". */
export function StatusPill({ tone = "neutral", className, children }: { tone?: StatusTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] leading-none", toneClass[tone], className)}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}
