import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EvidenceCard } from '../shared/EvidenceCard'
import { UnavailablePanel } from '../shared/UnavailablePanel'
import { TOOLTIP_STYLE } from '../utils/constants'

export function CorrectionImpactCard({
  data,
}: {
  data: Array<{ chunkIndex: number; correctionCount: number }>
}) {
  return (
    <EvidenceCard
      title="Correction Impact"
      subtitle="Which chunks required correction and how much repair was applied."
    >
      {data.length ? (
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={data}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="chunkIndex" tick={{ fill: 'rgb(var(--aura-dim))', fontSize: 11 }} />
            <YAxis tick={{ fill: 'rgb(var(--aura-dim))', fontSize: 11 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="correctionCount" fill="rgb(var(--aura-accent))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <UnavailablePanel message="Unavailable — no correction diagnostics were recorded." />
      )}
    </EvidenceCard>
  )
}
