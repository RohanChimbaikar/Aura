import { UnavailablePanel } from '../shared/UnavailablePanel'

export function WaveformStrip({
  title,
  points,
}: {
  title: string
  points: Array<{ x: number; y: number }>
}) {
  const width = 720
  const height = 88
  const baseline = height / 2
  const amplitude = height / 2 - 12
  const polyline = points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * width
      const y = baseline - Math.max(-1, Math.min(1, point.y)) * amplitude
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <div className="rounded-2xl border border-aura-border/8 bg-aura-bg/24 p-3">
      <div className="mb-2 text-xs font-semibold text-aura-muted">{title}</div>
      {points.length ? (
        <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full">
          <line
            x1="0"
            x2={width}
            y1={baseline}
            y2={baseline}
            stroke="rgb(var(--aura-border))"
            strokeOpacity="0.2"
          />
          <polyline
            points={polyline}
            fill="none"
            stroke="rgb(var(--aura-reveal))"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <UnavailablePanel message="Unavailable — this metric was not computed for the selected analysis." compact />
      )}
    </div>
  )
}
