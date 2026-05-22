export function ToolbarChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-aura-border/10 bg-aura-bg/35 px-3 py-1.5 text-xs text-aura-muted">
      {label}: {value}
    </div>
  )
}
