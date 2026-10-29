"use client"

export function PrintButton({ label }: { label: string }) {
  return (
    <button onClick={() => window.print()} className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary print:hidden">
      {label}
    </button>
  )
}
