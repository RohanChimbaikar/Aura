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

export function SignalQualityCard({
  data,
}: {
  data: Array<{ chunkIndex: number; signalQuality: number | null }>
}) {
  return (
    <EvidenceCard title="Signal Quality" subtitle="SNR or distortion by chunk.">
      {data.some((item) => item.signalQuality != null) ? (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="chunkIndex" tick={{ fill: 'rgb(var(--aura-dim))', fontSize: 11 }} />
            <YAxis tick={{ fill: 'rgb(var(--aura-dim))', fontSize: 11 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="signalQuality" fill="rgb(var(--aura-reveal))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <UnavailablePanel message="Unavailable — signal quality was not computed for the selected analysis." />
      )}
    </EvidenceCard>
  )
}
