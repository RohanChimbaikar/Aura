type Props = {
  label: string
  value: string
}

export function DataRow({ label, value }: Props) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm text-aura-muted">{label}</span>
      <span className="font-mono text-sm text-aura-text">{value}</span>
    </div>
  )
}
