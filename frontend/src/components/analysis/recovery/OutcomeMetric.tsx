

export function OutcomeMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[12px] border border-aura-border/10 bg-aura-bg/18 px-3 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-aura-dim">{label}</div>
      <div className="mt-2 text-lg font-semibold text-aura-text">{value}</div>
      <div className="mt-1 truncate font-mono text-[11px] text-aura-muted">{note}</div>
    </div>
  )
}