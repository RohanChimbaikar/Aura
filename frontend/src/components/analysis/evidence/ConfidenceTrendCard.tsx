import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EvidenceCard } from '../shared/EvidenceCard'
import { UnavailablePanel } from '../shared/UnavailablePanel'
import { TOOLTIP_STYLE } from '../utils/constants'

export function ConfidenceTrendCard({
  data,
}: {
  data: Array<{ chunkIndex: number; confidence: number }>
}) {
  return (
    <EvidenceCard
      title="Confidence Trend"
      subtitle="Confidence stability across sequence order."
    >
      {data.length ? (
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={data}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="chunkIndex" tick={{ fill: 'rgb(var(--aura-dim))', fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fill: 'rgb(var(--aura-dim))', fontSize: 11 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Line
              type="monotone"
              dataKey="confidence"
              stroke="rgb(var(--aura-reveal))"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <UnavailablePanel message="Unavailable — confidence trend was not computed." />
      )}
    </EvidenceCard>
  )
}
