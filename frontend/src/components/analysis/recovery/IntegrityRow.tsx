export function IntegrityRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 border-b border-aura-border/10 pb-3 last:border-b-0 last:pb-0">
      <div className="text-[11px] uppercase tracking-[0.13em] text-aura-dim">{label}</div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-aura-text">{value}</div>
        <div className="mt-1 truncate font-mono text-[11px] text-aura-muted">{detail}</div>
      </div>
    </div>
  )
}
