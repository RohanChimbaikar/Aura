import { useState, type ReactNode } from 'react'
import { ChevronDown, Copy } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge, Panel, Stat } from '../AuraPrimitives'
import { cn } from '../../lib/utils'
import { resolveUrl } from '../../services/api'
import type { AnalysisPayload } from '../../types'

const tooltipStyle = {
  backgroundColor: 'rgba(17, 20, 22, 0.96)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px',
  color: 'rgb(236,242,244)',
}

export function formatVerdict(status: string | null | undefined, hasRecoveredText: boolean) {
  if (!status) return hasRecoveredText ? 'Recovered' : 'No recovery available'
  return status
    .split('_')
    .join(' ')
    .replace(/\b\w/g, (char: string) => char.toUpperCase())
}

export function formatNullableBool(value: boolean | null | undefined) {
  if (value == null) return '—'
  return value ? 'Yes' : 'No'
}

export function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toFixed(digits)
}

function verdictTone(status: AnalysisPayload['summary']['recoveryStatus']) {
  if (status === 'failed') return 'danger'
  if (status === 'partial') return 'accent'
  return 'safe'
}

function confidenceColor(status: string) {
  if (status === 'complete') return 'rgb(var(--aura-reveal))'
  if (status === 'corrected') return 'rgb(var(--aura-accent))'
  if (status === 'low_confidence') return 'rgb(var(--aura-danger))'
  if (status === 'missing' || status === 'duplicate') return 'rgba(148,163,184,0.75)'
  return 'rgba(160,170,176,0.75)'
}

function cardTitleClass() {
  return 'text-[11px] font-semibold uppercase tracking-[0.18em] text-aura-dim/90'
}

function cardSubtitleClass() {
  return 'mt-1 text-sm leading-6 text-aura-muted'
}

export function RecoveryVerdictCard({ analysis }: { analysis: AnalysisPayload }) {
  const subtleIssue =
    analysis.summary.recoveryStatus === 'partial'
      ? 'Some segments were not fully recoverable. Review chunk evidence before trusting the full transmission.'
      : analysis.summary.recoveryStatus === 'recovered_with_corrections'
        ? 'Recovery required corrective passes. Confidence remains high, but repaired regions are marked below.'
        : analysis.summary.recoveryStatus === 'failed'
          ? 'Recovery could not be verified from the available signal evidence.'
          : ''

  return (
    <Panel className="p-5 lg:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={cardTitleClass()}>Recovery verdict</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={verdictTone(analysis.summary.recoveryStatus)}>
              {formatVerdict(analysis.summary.recoveryStatus, Boolean(analysis.summary.recoveredText))}
            </Badge>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-aura-dim">
            Confidence
          </div>
          <div className="mt-1 text-[34px] font-semibold tracking-tight text-aura-text">
            {analysis.summary.recoveryConfidence.toFixed(0)}%
          </div>
          <div className="mt-1 text-sm text-aura-muted">
            Integrity {analysis.summary.integrityScore.toFixed(0)}%
          </div>
        </div>
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-6 text-aura-muted">
        {analysis.summary.trustMessage}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Files" value={`${analysis.summary.filesProcessed} / ${analysis.summary.filesTotal}`} />
        <Stat label="Header" value={formatNullableBool(analysis.summary.headerValid)} />
        <Stat label="Sequence" value={analysis.summary.sequenceValid ? 'Complete' : 'Issue detected'} />
        <Stat label="Corrections" value={String(analysis.summary.correctionsCount)} />
      </div>

      {subtleIssue ? (
        <div className="mt-4 rounded-2xl border border-aura-border/10 bg-aura-bg/28 px-4 py-3 text-sm text-aura-muted">
          {subtleIssue}
        </div>
      ) : null}
    </Panel>
  )
}

export function RecoveredMessageCard({
  analysis,
  recoveredText,
}: {
  analysis: AnalysisPayload
  recoveredText: string
}) {
  const note =
    analysis.summary.recoveryStatus === 'partial'
      ? 'Partial recovery. The text below may exclude missing or weak regions.'
      : analysis.summary.recoveryStatus === 'recovered_with_corrections'
        ? 'Recovered with correction passes. Review correction impact for repaired chunks.'
        : ''

  return (
    <Panel className="p-5 lg:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={cardTitleClass()}>Recovered message</div>
          {note ? <div className={cardSubtitleClass()}>{note}</div> : null}
        </div>
        {recoveredText ? (
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(recoveredText)}
            className="inline-flex items-center rounded-xl border border-aura-border/10 bg-aura-bg/35 px-3 py-2 text-sm font-semibold text-aura-text transition-colors hover:bg-aura-bg/50"
          >
            <Copy size={14} className="mr-2" />
            Copy
          </button>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-aura-border/8 bg-aura-bg/24 px-4 py-4 lg:px-5 lg:py-5">
        <p className="whitespace-pre-wrap break-words text-[20px] leading-9 text-aura-text lg:text-[22px]">
          {recoveredText || 'No recoverable hidden text detected.'}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Total chunks" value={String(analysis.summary.payloadChunks)} />
        <Stat label="Ignored tail" value={String(analysis.summary.ignoredTail)} />
        <Stat
          label="Missing / duplicate"
          value={`${analysis.summary.missingPartsCount} / ${analysis.summary.duplicatePartsCount}`}
        />
      </div>
    </Panel>
  )
}

function EvidenceCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string
  subtitle: string
  children: ReactNode
  className?: string
}) {
  return (
    <Panel className={cn('p-5 lg:p-6', className)}>
      <div className="mb-4">
        <div className={cardTitleClass()}>{title}</div>
        <div className={cardSubtitleClass()}>{subtitle}</div>
      </div>
      {children}
    </Panel>
  )
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
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="confidence" radius={[6, 6, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.chunkIndex} fill={confidenceColor(entry.status)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <UnavailableState message="Unavailable — this metric was not computed for the selected analysis." />
      )}
    </EvidenceCard>
  )
}

export function RecoverySequenceCard({
  items,
}: {
  items: AnalysisPayload['charts']['sequenceProgress']
}) {
  return (
    <EvidenceCard
      title="Recovery Sequence"
      subtitle="Ordered transmission state across the recovered sequence."
      className="xl:col-span-1"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {items.map((item) => (
          <div
            key={item.partNumber}
            className="rounded-2xl border border-aura-border/8 bg-aura-bg/24 px-3 py-3 transition-colors hover:border-aura-border/14"
          >
            <div className="text-xs text-aura-muted">Part {item.partNumber}</div>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  item.status === 'complete'
                    ? 'bg-aura-reveal'
                    : item.status === 'corrected'
                      ? 'bg-aura-accent'
                      : item.status === 'missing' || item.status === 'duplicate'
                        ? 'bg-aura-danger'
                        : 'bg-aura-dim',
                )}
              />
              <Badge
                tone={
                  item.status === 'missing' || item.status === 'duplicate'
                    ? 'danger'
                    : item.status === 'corrected' || item.status === 'processing'
                      ? 'accent'
                      : 'safe'
                }
              >
                {item.status.replace('_', ' ')}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </EvidenceCard>
  )
}

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
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="signalQuality" fill="rgb(var(--aura-reveal))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <UnavailableState message="Unavailable — signal quality was not computed for the selected analysis." />
      )}
    </EvidenceCard>
  )
}

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
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="correctionCount" fill="rgb(var(--aura-accent))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <UnavailableState message="Unavailable — no correction diagnostics were recorded." />
      )}
    </EvidenceCard>
  )
}

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
            <Tooltip contentStyle={tooltipStyle} />
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
        <UnavailableState message="Unavailable — confidence trend was not computed." />
      )}
    </EvidenceCard>
  )
}

export function PayloadStructureCard({
  structure,
}: {
  structure: AnalysisPayload['charts']['payloadStructure']
}) {
  const total = Math.max(
    1,
    structure.headerBlocks +
      structure.payloadBlocks +
      structure.redundancyBlocks +
      structure.ignoredTailBlocks +
      structure.duplicateBlocks,
  )
  const segments = [
    { label: 'Header', value: structure.headerBlocks, color: 'rgb(var(--aura-accent))' },
    { label: 'Payload', value: structure.payloadBlocks, color: 'rgb(var(--aura-reveal))' },
    { label: 'Redundancy', value: structure.redundancyBlocks, color: 'rgba(148,163,184,0.75)' },
    { label: 'Ignored tail', value: structure.ignoredTailBlocks, color: 'rgba(249,115,22,0.85)' },
    { label: 'Duplicates', value: structure.duplicateBlocks, color: 'rgba(239,68,68,0.9)' },
  ]

  return (
    <EvidenceCard
      title="Payload Structure"
      subtitle="Header, payload, redundancy, ignored tail, and duplicate composition."
    >
      <div className="flex h-4 overflow-hidden rounded-full bg-aura-bg/35">
        {segments.map((segment) =>
          segment.value > 0 ? (
            <div
              key={segment.label}
              style={{ width: `${(segment.value / total) * 100}%`, background: segment.color }}
              title={`${segment.label}: ${segment.value}`}
            />
          ) : null,
        )}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between text-sm">
            <span className="text-aura-muted">{segment.label}</span>
            <span className="text-aura-text">{segment.value}</span>
          </div>
        ))}
      </div>
    </EvidenceCard>
  )
}

export function CoverStegoCompareSection({
  analysis,
  selectedPart,
  onSelectPart,
}: {
  analysis: AnalysisPayload
  selectedPart: number | 'all'
  onSelectPart: (part: number | 'all') => void
}) {
  const compareSpectrogram = analysis.charts.compareSpectrogram
  const waveformComparison = analysis.charts.waveformComparison
  const partOptions = compareSpectrogram?.partOptions ?? []

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className={cardTitleClass()}>Cover vs Stego Comparison</div>
          <div className={cardSubtitleClass()}>
            Visual comparison using the original carrier and the generated stego audio.
          </div>
        </div>
        {analysis.provenance.grouped && partOptions.length ? (
          <div className="flex flex-wrap gap-1.5 rounded-full border border-aura-border/10 bg-aura-bg/24 p-1">
            <PartSelectorButton
              active={selectedPart === 'all'}
              onClick={() => onSelectPart('all')}
              label="All"
            />
            {partOptions.map((part) => (
              <PartSelectorButton
                key={part}
                active={selectedPart === part}
                onClick={() => onSelectPart(part)}
                label={`Part ${part}`}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SpectrogramCompareCard label="Cover" src={compareSpectrogram?.coverImageUrl} available={Boolean(compareSpectrogram?.available)} />
        <SpectrogramCompareCard label="Stego" src={compareSpectrogram?.stegoImageUrl} available={Boolean(compareSpectrogram?.available)} />
        <SpectrogramCompareCard label="Difference" src={compareSpectrogram?.diffImageUrl} available={Boolean(compareSpectrogram?.available)} />
      </div>

      <Panel className="p-5 lg:p-6">
        <div className="mb-4">
          <div className={cardTitleClass()}>Waveform Comparison</div>
          <div className={cardSubtitleClass()}>
            Compact waveform evidence from real backend-derived traces.
          </div>
        </div>
        {waveformComparison?.available ? (
          <div className="grid gap-3">
            <WaveformStrip title="Cover waveform" points={waveformComparison.coverWaveform ?? []} />
            <WaveformStrip title="Stego waveform" points={waveformComparison.stegoWaveform ?? []} />
            <WaveformStrip title="Difference waveform" points={waveformComparison.diffWaveform ?? []} />
          </div>
        ) : (
          <UnavailableState message="Compare visuals are unavailable because the original cover audio link was not persisted for this transmission." />
        )}
      </Panel>
    </section>
  )
}

export function AdvancedDiagnosticsSection({
  analysis,
  chunkRows,
}: {
  analysis: AnalysisPayload
  chunkRows: AnalysisPayload['chunkTable']
}) {
  const [open, setOpen] = useState(false)
  const corrections = analysis.recovery.changes

  return (
    <div className="overflow-hidden rounded-2xl border border-aura-border/8 bg-aura-surface/72">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-aura-text transition-colors hover:bg-aura-bg/12"
      >
        <span>Advanced Diagnostics</span>
        <ChevronDown
          size={16}
          className={cn('transition-transform duration-200', open ? 'rotate-180' : 'rotate-0')}
        />
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-aura-border/8 px-5 py-5">
            <div className="overflow-auto rounded-2xl border border-aura-border/8 bg-aura-bg/28">
              <table className="min-w-full text-left text-xs text-aura-text">
                <thead className="border-b border-aura-border/8 text-aura-muted">
                  <tr>
                    <th className="px-3 py-2">Chunk</th>
                    <th className="px-3 py-2">Part</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Confidence</th>
                    <th className="px-3 py-2">SNR</th>
                    <th className="px-3 py-2">MSE</th>
                    <th className="px-3 py-2">Bit agreement</th>
                    <th className="px-3 py-2">Corrections</th>
                    <th className="px-3 py-2">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {chunkRows.map((row) => (
                    <tr
                      key={`${row.chunkIndex}-${row.partNumber ?? 0}`}
                      className="border-b border-aura-border/6 last:border-b-0"
                    >
                      <td className="px-3 py-2 font-mono">{row.chunkIndex}</td>
                      <td className="px-3 py-2">{row.partNumber ?? '—'}</td>
                      <td className="px-3 py-2">{row.status}</td>
                      <td className="px-3 py-2">{formatNumber(row.confidence)}</td>
                      <td className="px-3 py-2">{formatNumber(row.snrDb)}</td>
                      <td className="px-3 py-2">{formatNumber(row.mse, 6)}</td>
                      <td className="px-3 py-2">{formatNumber(row.bitAgreement)}</td>
                      <td className="px-3 py-2">{row.correctionCount}</td>
                      <td className="px-3 py-2">
                        {row.isMissing ? 'missing' : row.isDuplicate ? 'duplicate' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Panel className="p-4">
                <div className={cardTitleClass()}>Forensic notes</div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-aura-muted">
                  <p>Header validation: {formatNullableBool(analysis.summary.headerValid)}.</p>
                  <p>Sequence anomalies: {analysis.summary.sequenceValid ? 'none detected' : 'present'}.</p>
                  <p>Ignored tail blocks: {analysis.summary.ignoredTail}.</p>
                  <p>
                    Corrections applied: {analysis.summary.correctionsApplied ? `${analysis.summary.correctionsCount} chunk adjustments recorded.` : 'none recorded.'}
                  </p>
                </div>
              </Panel>

              <Panel className="p-4">
                <div className={cardTitleClass()}>Artifact references</div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-aura-muted">
                  <p>Provenance assets linked: {analysis.provenance.assets.length}.</p>
                  <p>Compare artifacts available: {analysis.charts.compareSpectrogram?.available ? 'yes' : 'no'}.</p>
                  <p>Corrections listed: {corrections.length ? corrections.length : 0}.</p>
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function EmptyAnalysisState() {
  return (
    <Panel className="p-6 lg:p-8">
      <div className="max-w-xl">
        <div className={cardTitleClass()}>Forensic analysis</div>
        <p className="mt-3 text-sm leading-6 text-aura-muted">
          Select an audio or recovered transmission to inspect forensic analysis.
        </p>
      </div>
    </Panel>
  )
}

export function LoadingAnalysisState() {
  return (
    <Panel className="space-y-4 p-6">
      <div className="h-5 w-40 animate-pulse rounded bg-aura-bg/45" />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-52 animate-pulse rounded-2xl bg-aura-bg/40" />
        <div className="h-52 animate-pulse rounded-2xl bg-aura-bg/40" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="h-64 animate-pulse rounded-2xl bg-aura-bg/40" />
        <div className="h-64 animate-pulse rounded-2xl bg-aura-bg/40" />
        <div className="h-64 animate-pulse rounded-2xl bg-aura-bg/40" />
      </div>
    </Panel>
  )
}

function PartSelectorButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'bg-aura-reveal/12 text-aura-reveal'
          : 'text-aura-muted hover:bg-aura-bg/30 hover:text-aura-text',
      )}
    >
      {label}
    </button>
  )
}

function SpectrogramCompareCard({
  label,
  src,
  available,
}: {
  label: string
  src?: string | null
  available: boolean
}) {
  return (
    <Panel className="overflow-hidden p-0">
      <div className="border-b border-aura-border/8 px-4 py-3 text-xs font-semibold text-aura-muted">
        {label}
      </div>
      {available && src ? (
        <img src={resolveUrl(src)} alt={label} className="aspect-[16/9] w-full object-cover" />
      ) : (
        <UnavailableState
          message="Unavailable — cover/stego provenance not found for this item."
          compact={false}
        />
      )}
    </Panel>
  )
}

function WaveformStrip({
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
        <UnavailableState message="Unavailable — this metric was not computed for the selected analysis." compact />
      )}
    </div>
  )
}

function UnavailableState({
  message,
  compact = false,
}: {
  message: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-2xl border border-dashed border-aura-border/12 bg-aura-bg/22 px-4 text-center text-sm text-aura-dim',
        compact ? 'min-h-[88px] py-4' : 'min-h-[220px] py-10',
      )}
    >
      {message}
    </div>
  )
}
