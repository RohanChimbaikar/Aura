export function DenseKeyValue({
  label,
  value,
  className = '',
}: {
  label: string
  value: string | number
  className?: string
}) {
  return (
    <div className={className}>
      {label}: <span className="font-semibold text-aura-text">{value}</span>
    </div>
  )
}
