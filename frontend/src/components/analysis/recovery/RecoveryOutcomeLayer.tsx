import { Clipboard, ShieldCheck } from 'lucide-react'

import { MessageModeToggle } from './MessageModeToggle'
import { OutcomeBadge } from './OutcomeBadge'
import { OutcomeMetric } from './OutcomeMetric'
import { IntegrityRow } from './IntegrityRow'
import type { AnalysisPayload, SelectedAudio } from '../../../types'
type MessageMode = 'recovered' | 'raw'
type MetricTone = 'safe' | 'neutral' | 'warning' | 'danger'
type PayloadRole = 'header' | 'payload' | 'redundancy' | 'tail' | 'duplicate' | 'unknown'
import { clamp, formatPercentValue } from '../utils/signalTimeline'


type ChunkInsight = {
  row: AnalysisPayload['chunkTable'][number]
  order: number
  role: PayloadRole
  activePayload: boolean
  confidence: number | null
  bitAccuracy: number | null
  corruption: number
  tone: MetricTone
}

function normalizePercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null
  return clamp(value > 1 ? value / 100 : value, 0, 1)
}

function getPayloadRole(
  order: number,
  row: AnalysisPayload['chunkTable'][number],
  structure: AnalysisPayload['charts']['payloadStructure'],
): PayloadRole {
  if (row.isDuplicate) return 'duplicate'
  const headerEnd = Math.max(0, structure.headerBlocks)
  const payloadEnd = headerEnd + Math.max(0, structure.payloadBlocks)
  const redundancyEnd = payloadEnd + Math.max(0, structure.redundancyBlocks)
  const tailEnd = redundancyEnd + Math.max(0, structure.ignoredTailBlocks)

  if (order < headerEnd) return 'header'
  if (order < payloadEnd) return 'payload'
  if (order < redundancyEnd) return 'redundancy'
  if (order < tailEnd) return 'tail'
  return 'unknown'
}

function getChunkInsights(
  chunkRows: AnalysisPayload['chunkTable'],
  structure: AnalysisPayload['charts']['payloadStructure'],
): ChunkInsight[] {
  return chunkRows.map((row, order) => {
    const confidence = typeof row.confidence === 'number' ? normalizePercent(row.confidence) : null
    const bitAccuracy = typeof row.bitAgreement === 'number' ? normalizePercent(row.bitAgreement) : null
    const role = getPayloadRole(order, row, structure)
    const correctionPressure = clamp((row.correctionCount || 0) / 4, 0, 1)
    const bitPressure = bitAccuracy == null ? 0 : 1 - bitAccuracy
    const confidencePressure = confidence == null ? 0 : 1 - confidence
    const stftPressure =
      typeof row.stftDeltaScore === 'number' ? clamp(row.stftDeltaScore * 5, 0, 1) : 0
    const structuralPressure = row.isMissing || row.isDuplicate ? 1 : 0
    const statusPressure = row.status === 'low_confidence' || row.status === 'missing' ? 0.35 : 0
    const corruption = clamp(
      structuralPressure ||
        confidencePressure * 0.36 +
          bitPressure * 0.44 +
          correctionPressure * 0.16 +
          stftPressure * 0.18 +
          statusPressure,
      0,
      1,
    )

    return {
      row,
      order,
      role,
      activePayload: role === 'header' || role === 'payload' || role === 'redundancy',
      confidence,
      bitAccuracy,
      corruption,
      tone: getChunkTone(row, confidence, corruption),
    }
  })
}
function getChunkTone(
  row: AnalysisPayload['chunkTable'][number],
  confidence: number | null,
  corruption: number,
): MetricTone {
  if (row.isMissing || row.isDuplicate || row.status === 'missing' || corruption >= 0.62) return 'danger'
  if (row.status === 'low_confidence' || corruption >= 0.3 || (confidence != null && confidence < 0.72)) {
    return 'warning'
  }
  if (confidence != null) return 'safe'
  return 'neutral'
}
function getRecoveryVerdict(
  analysis: AnalysisPayload,
  recoveredText: string,
  successLike: boolean,
) {
  const readable = recoveredText.trim().length > 0
  const structuralLoss =
    analysis.summary.missingPartsCount > 0 ||
    analysis.summary.duplicatePartsCount > 0 ||
    analysis.summary.sequenceValid === false ||
    (analysis.missingParts?.length ?? 0) > 0
  const recoveryStatus = String(analysis.summary.recoveryStatus || '').toLowerCase()

  if (!readable || recoveryStatus === 'failed') {
    return {
      title: 'Hidden payload not recovered',
      status: 'Recovery failed',
      tone: 'danger' as MetricTone,
    }
  }

  if (structuralLoss || recoveryStatus === 'partial') {
    return {
      title: 'Payload recovered with review flags',
      status: 'Needs review',
      tone: 'warning' as MetricTone,
    }
  }

  return {
    title: 'Recovered payload',
    status: successLike ? 'Recovery successful' : 'Recovery complete',
    tone: 'safe' as MetricTone,
  }
}

export function RecoveryOutcomeLayer({
  analysis,
  selectedAudio,
  recoveredText,
  rawText,
  messageMode,
  onMessageModeChange,
  successLike,
}: {
  analysis: AnalysisPayload
  selectedAudio: SelectedAudio | null
  recoveredText: string
  rawText: string
  messageMode: MessageMode
  onMessageModeChange: (mode: MessageMode) => void
  successLike: boolean
}) {
  const displayedText = messageMode === 'raw' ? rawText : recoveredText
  const canCompare = Boolean(rawText && rawText !== recoveredText)
  const recovery = getRecoveryVerdict(analysis, recoveredText, successLike)
  const chunkInsights = getChunkInsights(analysis.chunkTable, analysis.charts.payloadStructure)
  const bitAccuracy = getAverageBitAccuracy(chunkInsights)
  const duration = getDurationLabel(analysis, selectedAudio)
  const payloadBytes = getTextByteLength(recoveredText)
  const corruptionSummary = getCorruptionSummary(analysis, chunkInsights)
  const metricRows = [
    {
      label: 'Confidence',
      value: formatPercentValue(normalizePercent(analysis.summary.recoveryConfidence)),
      note: 'decode confidence',
    },
    {
      label: 'Character accuracy',
      value: analysis.summary.characterAccuracy !== undefined && analysis.summary.characterAccuracy !== null
        ? formatPercentValue(analysis.summary.characterAccuracy)
        : 'Not computed',
      note: analysis.summary.characterAccuracy !== undefined && analysis.summary.characterAccuracy !== null
        ? 'plaintext character agreement'
        : 'original plaintext unavailable',
    },
    {
      label: 'Bit accuracy',
      value: formatPercentValue(bitAccuracy),
      note: bitAccuracy == null ? 'not computed' : 'chunk bit agreement',
    },
    {
      label: 'Payload size',
      value: formatBytes(payloadBytes),
      note: 'recovered UTF-8 text',
    },
    {
      label: 'Chunk count',
      value: String(analysis.summary.payloadChunks || analysis.chunkTable.length || 0),
      note: `${analysis.summary.ignoredTail || 0} ignored tail`,
    },
    {
      label: 'Audio duration',
      value: duration,
      note: selectedAudio?.source || 'selected target',
    },
  ]

  return (
    <section aria-label="Primary recovery outcome">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-aura-dim">
            Layer 1 / Primary outcome
          </div>
          <h2 className="mt-2 text-[34px] font-semibold leading-tight tracking-normal text-aura-text lg:text-[46px]">
            {recovery.title}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <MessageModeToggle
            value={messageMode}
            onChange={onMessageModeChange}
            disabledRaw={!canCompare}
          />
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(displayedText)}
            disabled={!displayedText}
            className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-aura-border/10 px-3 text-[12px] font-medium text-aura-text transition-colors hover:bg-aura-surfaceSoft disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Clipboard size={14} />
            Copy
          </button>
        </div>
      </div>

      <div className="aura-transcript-surface overflow-hidden rounded-[16px]">
        <div className="grid xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 px-5 py-5 lg:px-7 lg:py-7">
            <div className="flex flex-col gap-3 border-b border-aura-border/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <OutcomeBadge tone={recovery.tone}>{recovery.status}</OutcomeBadge>
                <span className="font-mono text-[11px] text-aura-muted">
                  {messageMode === 'raw' ? 'raw decoder output' : 'validated recovery text'}
                </span>
              </div>
              <div className="truncate font-mono text-[11px] text-aura-dim">
                {selectedAudio?.selectedPartFilename || selectedAudio?.fileName || analysis.analysisId}
              </div>
            </div>

            <p className="mt-6 min-h-[92px] select-text whitespace-pre-wrap break-words font-mono text-[28px] leading-[1.4] text-aura-text sm:text-[34px]">
              {displayedText || 'No recoverable hidden text detected.'}
            </p>

            <div className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {metricRows.map((metric) => (
                <OutcomeMetric key={metric.label} label={metric.label} value={metric.value} note={metric.note} />
              ))}
            </div>
          </div>

          <aside className="border-t border-aura-border/10 bg-aura-bg/20 px-5 py-5 xl:border-l xl:border-t-0 lg:px-6 lg:py-6">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-aura-dim">
              <ShieldCheck size={14} />
              Recovery integrity
            </div>

            <div className="mt-5 space-y-3">
              <IntegrityRow
                label="Error correction"
                value={getEccLabel(analysis)}
                detail={`${analysis.summary.correctionsCount || 0} recorded correction(s)`}
              />
              <IntegrityRow
                label="Sequence"
                value={analysis.summary.sequenceValid === false ? 'Flagged' : 'Validated'}
                detail={`${analysis.summary.missingPartsCount || 0} missing / ${analysis.summary.duplicatePartsCount || 0} duplicate`}
              />
              <IntegrityRow
                label="Header"
                value={formatNullableBool(analysis.summary.headerValid)}
                detail="backend header validation"
              />
              <IntegrityRow
                label="Files"
                value={`${analysis.summary.filesProcessed} / ${analysis.summary.filesTotal}`}
                detail={analysis.sourceType === 'grouped' ? 'transmission parts' : 'analysis source'}
              />
            </div>

            <div className="mt-5 rounded-[12px] border border-aura-border/10 bg-aura-bg/24 px-3 py-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-aura-dim">
                Corruption resilience
              </div>
              <p className="mt-2 text-sm leading-6 text-aura-muted">{corruptionSummary}</p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
function getAverageBitAccuracy(insights: ChunkInsight[]) {
  return averageNullable(insights.map((insight) => insight.bitAccuracy))
}

function getDurationLabel(analysis: AnalysisPayload, selectedAudio: SelectedAudio | null) {
  const duration =
    analysis.legacy?.signal.durationSec ??
    analysis.legacy?.signal.duration ??
    selectedAudio?.metadata?.carrier_duration_sec ??
    null

  if (typeof duration !== 'number' || !Number.isFinite(duration)) return 'Not computed'
  const minutes = Math.floor(duration / 60)
  const seconds = Math.round(duration % 60)
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`
}


function getTextByteLength(value: string) {
  if (!value) return 0
  return new TextEncoder().encode(value).length
}

function getCorruptionSummary(analysis: AnalysisPayload, insights: ChunkInsight[]) {
  const corrections = analysis.summary.correctionsCount || 0
  const weakChunks = insights.filter((insight) => insight.tone === 'danger').length
  const missing = analysis.summary.missingPartsCount || 0
  const failed = analysis.summary.failedPartsCount || 0
  const duplicates = analysis.summary.duplicatePartsCount || 0

  if (missing || failed || duplicates || analysis.summary.sequenceValid === false) {
    return `Sequence diagnostics report ${missing} missing, ${failed} failed to decode, and ${duplicates} duplicate part(s). Review chunk evidence before trusting the full transmission.`
  }

  if (corrections) {
    return `${corrections} correction(s) were applied while the sequence remained intact. Recovered text stays visible with repaired regions exposed below.`
  }

  if (weakChunks) {
    return `${weakChunks} chunk(s) show high corruption pressure even though no sequence loss was reported.`
  }

  return 'No sequence loss or correction pressure was reported by the current analysis payload.'
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  return `${(value / 1024).toFixed(1)} KB`
}
function getEccLabel(analysis: AnalysisPayload) {
  if (analysis.summary.correctionsApplied || analysis.summary.correctionsCount > 0) return 'Applied'
  return 'No correction recorded'
}
function formatNullableBool(value: boolean | null | undefined) {
  if (value == null) return 'Not computed'
  return value ? 'Yes' : 'No'
}

function averageNullable(values: Array<number | null | undefined>) {
  const emitted = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (!emitted.length) return null
  return emitted.reduce((sum, value) => sum + value, 0) / emitted.length
}