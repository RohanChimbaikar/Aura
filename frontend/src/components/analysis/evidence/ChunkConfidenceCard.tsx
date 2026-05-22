import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EvidenceCard } from '../shared/EvidenceCard'
import { UnavailablePanel } from '../shared/UnavailablePanel'
import { TOOLTIP_STYLE } from '../utils/constants'

function confidenceColor(status: string) {
  if (status === 'complete') return 'rgb(var(--aura-reveal))'
  if (status === 'corrected') return 'rgb(var(--aura-accent))'
  if (status === 'low_confidence') return 'rgb(var(--aura-danger))'
  if (status === 'missing' || status === 'duplicate') return 'rgba(148,163,184,0.75)'
  return 'rgba(160,170,176,0.75)'
}

export function ChunkConfidenceCard({
  data,
}: {
  data: Array<{ chunkIndex: number; confidence: number; status: string }>
}) {
  return (
    <EvidenceCard
      title="Chunk Confidence"
      subtitle="Per-chunk recovery confidence across the transmission."
      className="xl:col-span-1"
    >
      {data.length ? (
        <ResponsiveContainer width="100%" height={270}>
          <BarChart data={data}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="chunkIndex" tick={{ fill: 'rgb(var(--aura-dim))', fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fill: 'rgb(var(--aura-dim))', fontSize: 11 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="confidence" radius={[6, 6, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.chunkIndex} fill={confidenceColor(entry.status)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <UnavailablePanel message="Unavailable — this metric was not computed for the selected analysis." />
      )}
    </EvidenceCard>
  )
}
