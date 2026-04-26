import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Panel } from '../components/AuraPrimitives'
import type { AnalysisPayload, SelectedAudio } from '../types'

type Props = {
  analysis: AnalysisPayload | null
  selectedAudio: SelectedAudio | null
  availableAudio: SelectedAudio[]
  onAnalyzeAudio: (audio: SelectedAudio) => Promise<void> | void
  loading?: boolean
  error?: string
}

export function AnalysisPageV2({
  analysis,
  selectedAudio,
  availableAudio,
  onAnalyzeAudio,
  loading,
  error,
}: Props) {
  const options = useMemo(() => {
    const map = new Map<string, SelectedAudio>()
    availableAudio.forEach((audio) => {
      map.set(`${audio.messageId}__${audio.audioUrl}`, audio)
    })
    if (selectedAudio) {
      map.set(`${selectedAudio.messageId}__${selectedAudio.audioUrl}`, selectedAudio)
    }
    return Array.from(map.entries()).map(([key, audio]) => ({ key, audio }))
  }, [availableAudio, selectedAudio])

  const selectedKey = selectedAudio
    ? `${selectedAudio.messageId}__${selectedAudio.audioUrl}`
    : ''

  const [pickerKey, setPickerKey] = useState(selectedKey)

  useEffect(() => {
    setPickerKey(selectedKey)
  }, [selectedKey])

  const pickedAudio = useMemo(
    () => options.find((option) => option.key === pickerKey)?.audio ?? null,
    [options, pickerKey],
  )

  const recoveryText =
    analysis?.recovery.corrected_text?.trim() ||
    analysis?.recovery.raw_text?.trim() ||
    ''
  const waveform = analysis?.signal.waveform ?? []
  const energy = analysis?.signal.differenceWaveform ?? []
  const sourceLabel = analysis?.signal.source ?? (pickedAudio?.source === 'Uploaded' ? 'uploaded' : 'generated')
  const hasRecoveredText = Boolean(recoveryText)
  const recoveryLabel = formatRecoveryStatus(analysis?.recovery.recovery_status, hasRecoveredText)

  async function handleAnalyzeClick() {
    if (!pickedAudio || loading) return
    await onAnalyzeAudio(pickedAudio)
  }

  return (
    <div className="space-y-4">
      <Panel className="p-4 lg:p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-aura-dim/90">
              Input audio
            </div>
            <div className="relative">
              <select
                value={pickerKey}
                onChange={(e) => setPickerKey(e.target.value)}
                className="h-11 w-full appearance-none rounded-2xl border border-aura-border/10 bg-aura-bg/35 px-4 pr-10 text-sm text-aura-text outline-none transition-colors focus:border-aura-reveal/35"
              >
                {options.length === 0 ? <option value="">No audio available</option> : null}
                {options.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.audio.fileName} • {option.audio.source}
                  </option>
                ))}
              </select>

              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-aura-dim"
              />
            </div>
            <div className="mt-2 text-xs text-aura-muted">
              {analysis?.signal.file_name || pickedAudio?.fileName || 'Select an audio message to begin'}
            </div>
          </div>
          <div className="flex items-center gap-2 lg:justify-end">
            <div className="rounded-full border border-aura-border/10 bg-aura-bg/35 px-3 py-1.5 text-xs text-aura-muted">
              Source: {sourceLabel}
            </div>
            <button
              type="button"
              onClick={handleAnalyzeClick}
              disabled={!pickedAudio || loading}
              className="h-11 rounded-2xl border border-aura-reveal/18 bg-aura-reveal/10 px-5 text-sm font-semibold text-aura-reveal transition-all hover:bg-aura-reveal/14 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Running analysis…' : 'Run analysis'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-2xl border border-aura-danger/20 bg-aura-danger/10 px-4 py-3 text-sm text-aura-danger">
            {error}
          </div>
        ) : null}
      </Panel>

      {loading ? (
        <Panel className="space-y-3 p-5">
          <div className="h-5 w-44 animate-pulse rounded bg-aura-bg/45" />
          <div className="h-24 animate-pulse rounded-2xl bg-aura-bg/45" />
          <div className="h-40 animate-pulse rounded-2xl bg-aura-bg/45" />
        </Panel>
      ) : null}

      {analysis ? (
        <>
          <Panel className="p-5 lg:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-aura-dim/90">
                  Recovery outcome
                </div>
                <div className="mt-1 text-sm text-aura-muted">{recoveryLabel}</div>
              </div>
              <div className="rounded-full border border-aura-border/10 bg-aura-bg/35 px-3 py-1.5 text-xs text-aura-muted">
                {analysis.message_id}
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-aura-border/8 bg-aura-bg/35 p-4 lg:p-5">
              <p className="whitespace-pre-wrap break-words text-[20px] leading-9 text-aura-text">
                {hasRecoveredText ? recoveryText : 'No recoverable hidden text detected.'}
              </p>
              {analysis.recovery.changes.length > 0 ? (
                <p className="mt-2 text-xs text-aura-muted">
                  Corrections applied: {analysis.recovery.changes.length}
                </p>
              ) : null}
            </div>
          </Panel>

          <Panel className="p-5 lg:p-6">
            <div className="mb-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-aura-dim/90">
                Signal evidence
              </div>
              <div className="mt-1 text-sm text-aura-muted">
                Waveform and embedded energy are rendered from backend-provided signal arrays.
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <SignalPlot title="Waveform" values={waveform} />
              <SignalPlot title="Embedded energy" values={energy} positiveOnly />
            </div>
          </Panel>

          <Panel className="p-5 lg:p-6">
            <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-aura-dim/90">
              Format summary
            </div>
            <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <SummaryRow label="Source" value={analysis.signal.source} />
              <SummaryRow label="Duration" value={formatDuration(analysis.signal.durationSec ?? analysis.signal.duration)} />
              <SummaryRow label="Sample rate" value={formatSampleRate(analysis.signal.sample_rate || analysis.signal.sampleRate)} />
              <SummaryRow label="Channels" value={String(analysis.signal.channels)} />
              <SummaryRow label="Total chunks" value={analysis.signal.total_chunks == null ? '-' : String(analysis.signal.total_chunks)} />
              <SummaryRow label="Payload mode" value={analysis.payload.payload_mode} />
              <SummaryRow label="Protection" value={analysis.payload.protection} />
              <SummaryRow
                label="Header structure"
                value={`${analysis.payload.header_bytes} bytes / ${analysis.payload.header_nibbles} nibbles / ${analysis.payload.header_chunks} chunks`}
              />
              <SummaryRow label="Chunk duration" value={`${analysis.payload.chunk_duration}s`} />
              <SummaryRow label="Header mode" value={analysis.payload.header_mode_enabled ? 'enabled' : 'disabled'} />
            </div>
          </Panel>

          <details className="overflow-hidden rounded-2xl border border-aura-border/8 bg-aura-surface/72">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-aura-text">
              Advanced diagnostics
            </summary>
            <div className="border-t border-aura-border/8 px-5 py-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-aura-border/8 bg-aura-bg/32 p-4">
                  <div className="text-xs font-semibold text-aura-muted">Recovered (corrected)</div>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-6 text-aura-text">
                    {analysis.recovery.corrected_text || '(none)'}
                  </pre>
                </div>
                <div className="rounded-2xl border border-aura-border/8 bg-aura-bg/32 p-4">
                  <div className="text-xs font-semibold text-aura-muted">Raw recovered text</div>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-6 text-aura-text">
                    {analysis.recovery.raw_text || '(none)'}
                  </pre>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-aura-border/8 bg-aura-bg/32 p-4">
                <div className="text-xs font-semibold text-aura-muted">Corrections</div>
                {analysis.recovery.changes.length ? (
                  <ul className="mt-2 space-y-1 text-xs text-aura-text">
                    {analysis.recovery.changes.map((change, index) => (
                      <li key={`${change.from}-${change.to}-${index}`} className="font-mono">
                        {change.from}{' -> '}{change.to}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-aura-muted">No corrections recorded.</p>
                )}
              </div>
              {(analysis.encode || analysis.decode) ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-aura-border/8 bg-aura-bg/32 p-4">
                    <div className="text-xs font-semibold text-aura-muted">Encode summary</div>
                    <p className="mt-2 text-xs text-aura-text">
                      {analysis.encode
                        ? `Required chunks: ${analysis.encode.required_chunks ?? '-'}, carrier: ${analysis.encode.carrier_alias ?? '-'}`
                        : 'Encode data unavailable.'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-aura-border/8 bg-aura-bg/32 p-4">
                    <div className="text-xs font-semibold text-aura-muted">Decode summary</div>
                    <p className="mt-2 text-xs text-aura-text">
                      {analysis.decode
                        ? `Header valid: ${analysis.decode.header_valid ? 'yes' : 'no'}, decoded length: ${analysis.decode.decoded_message_length ?? '-'}`
                        : 'Decode data unavailable.'}
                    </p>
                  </div>
                </div>
              ) : null}
              {analysis.signal.spectrogram.values.length ? (
                <p className="mt-4 text-xs text-aura-dim">
                  Spectrogram bins available: {analysis.signal.spectrogram.timeBins} x {analysis.signal.spectrogram.freqBins}
                </p>
              ) : (
                <p className="mt-4 text-xs text-aura-dim">Spectrogram preview unavailable for this audio.</p>
              )}
            </div>
          </details>
        </>
      ) : null}

      {!analysis && !loading ? (
        <Panel className="p-5">
          <p className="text-sm text-aura-muted">
            Select an audio item and run analysis to view recovery outcome and signal evidence.
          </p>
        </Panel>
      ) : null}
    </div>
  )
}

function formatRecoveryStatus(status: string | null | undefined, hasRecoveredText: boolean) {
  if (!status) return hasRecoveredText ? 'Recovered text available' : 'No recovery available'
  return status
    .split('_')
    .join(' ')
    .replace(/\b\w/g, (char: string) => char.toUpperCase())
}

function formatDuration(value: number | null) {
  if (value == null || Number.isNaN(value)) return '-'
  if (value < 60) return `${value.toFixed(2)}s`
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `${minutes}m ${seconds.toFixed(1)}s`
}

function formatSampleRate(value: number | null | undefined) {
  if (!value) return '-'
  return `${Math.round(value).toLocaleString()} Hz`
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-aura-border/8 py-2 last:border-b-0">
      <span className="text-aura-muted">{label}</span>
      <span className="text-right text-aura-text">{value}</span>
    </div>
  )
}

function SignalPlot({
  title,
  values,
  positiveOnly = false,
}: {
  title: string
  values: number[]
  positiveOnly?: boolean
}) {
  const width = 720
  const height = 180
  const baseline = positiveOnly ? height - 18 : height / 2
  const amplitude = positiveOnly ? height - 30 : height / 2 - 16
  const points = values.length
    ? values
        .map((value, index) => {
          const x = (index / Math.max(1, values.length - 1)) * width
          const normalized = positiveOnly
            ? Math.max(0, Math.min(1, Math.abs(value)))
            : Math.max(-1, Math.min(1, value))
          const y = baseline - normalized * amplitude
          return `${x.toFixed(2)},${y.toFixed(2)}`
        })
        .join(' ')
    : ''

  return (
    <div className="rounded-2xl border border-aura-border/8 bg-aura-bg/30 p-3">
      <div className="mb-2 text-xs font-semibold text-aura-muted">{title}</div>
      {values.length ? (
        <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full">
          <line
            x1="0"
            x2={width}
            y1={baseline}
            y2={baseline}
            stroke="rgb(var(--aura-border))"
            strokeOpacity="0.2"
          />
          <polyline
            points={points}
            fill="none"
            stroke="rgb(var(--aura-reveal))"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <div className="flex h-44 items-center justify-center text-sm text-aura-dim">
          Signal preview unavailable.
        </div>
      )}
    </div>
  )
}