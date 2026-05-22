import { useEffect, useMemo, useState } from 'react'
import type { AnalysisPayload, SelectedAudio } from '../types'

import { AnalysisTopBar } from '../components/analysis/topbar/AnalysisTopBar'
import { AnalysisSummaryBanner } from '../components/analysis/states/AnalysisSummaryBanner'
import { AnalysisPipelineState } from '../components/analysis/states/AnalysisPipelineState'
import { AnalysisErrorState } from '../components/analysis/states/AnalysisErrorState'
import { AnalysisMismatchState } from '../components/analysis/states/AnalysisMismatchState'
import { TerminalAnalysisState } from '../components/analysis/states/TerminalAnalysisState'
import { EmptyResolvedAnalysisState } from '../components/analysis/states/EmptyResolvedAnalysisState'
import { EmptyAnalysisState } from '../components/analysis/states/EmptyAnalysisState'
import { RecoveryVerdictCard } from '../components/analysis/recovery/RecoveryVerdictCard'
import { RecoveredMessageCard } from '../components/analysis/recovery/RecoveredMessageCard'
import { ChunkConfidenceCard } from '../components/analysis/evidence/ChunkConfidenceCard'
import { RecoverySequenceCard } from '../components/analysis/evidence/RecoverySequenceCard'
import { SignalQualityCard } from '../components/analysis/evidence/SignalQualityCard'
import { CorrectionImpactCard } from '../components/analysis/evidence/CorrectionImpactCard'
import { ConfidenceTrendCard } from '../components/analysis/evidence/ConfidenceTrendCard'
import { PayloadStructureCard } from '../components/analysis/evidence/PayloadStructureCard'
import { CoverStegoCompareSection } from '../components/analysis/compare/CoverStegoCompareSection'
import { AdvancedDiagnosticsSection } from '../components/analysis/diagnostics/AdvancedDiagnosticsSection'

import {
  isTerminalStatus,
  isSuccessLikeStatus,
  hasPayloadStructure,
  hasCompareEvidence,
  hasDiagnostics,
  hasRenderablePayload,
  inferAudioSourceType,
  analysisMatchesAudio,
} from '../components/analysis/utils/math'
import {
  buildConfidenceData,
  buildSnrData,
  buildCorrectionData,
  buildConfidenceTrend,
} from '../components/analysis/utils/chunkMetrics'
import type { AudioOption } from '../components/analysis/types/analysis'

type Props = {
  analysis: AnalysisPayload | null
  selectedAudio: SelectedAudio | null
  availableAudio: SelectedAudio[]
  onAnalyzeAudio: (audio: SelectedAudio, options?: { force?: boolean }) => Promise<void> | void
  loading?: boolean
  error?: string
  hasAttempted?: boolean
  status?: 'idle' | 'loading' | 'success' | 'partial' | 'failed'
}

export function AnalysisPageV2({
  analysis,
  selectedAudio,
  availableAudio,
  onAnalyzeAudio,
  loading = false,
  error = '',
  hasAttempted = false,
  status = 'idle',
}: Props) {
  // ── Audio picker state ──────────────────────────────────────────────
  const options: AudioOption[] = useMemo(() => {
    const map = new Map<string, SelectedAudio>()

    availableAudio.forEach((audio) => {
      const key = `${audio.messageId || ''}__${audio.audioUrl || ''}__${audio.fileName || ''}`
      map.set(key, audio)
    })

    if (selectedAudio) {
      const key = `${selectedAudio.messageId || ''}__${selectedAudio.audioUrl || ''}__${selectedAudio.fileName || ''}`
      map.set(key, selectedAudio)
    }

    return Array.from(map.entries()).map(([key, audio]) => ({ key, audio }))
  }, [availableAudio, selectedAudio])

  const selectedKey = selectedAudio
    ? `${selectedAudio.messageId || ''}__${selectedAudio.audioUrl || ''}__${selectedAudio.fileName || ''}`
    : ''

  const [pickerKey, setPickerKey] = useState(selectedKey)
  const [selectedPart, setSelectedPart] = useState<number | 'all'>('all')
  const [activeStepIndex, setActiveStepIndex] = useState(0)

  useEffect(() => {
    setPickerKey(selectedKey)
  }, [selectedKey])

  const pickedAudio = useMemo(
    () => options.find((option) => option.key === pickerKey)?.audio ?? null,
    [options, pickerKey],
  )

  // ── Derived state ───────────────────────────────────────────────────
  const recoveryText =
    analysis?.summary?.recoveredText?.trim() ||
    analysis?.recovery?.corrected_text?.trim() ||
    analysis?.recovery?.raw_text?.trim() ||
    ''

  const analysisBelongsToPickedAudio = analysisMatchesAudio(analysis, pickedAudio)

  const resolvedSourceLabel =
    !loading && analysis && analysisBelongsToPickedAudio
      ? analysis.sourceType ?? analysis.mode
      : undefined

  const sourceLabel = resolvedSourceLabel ?? inferAudioSourceType(pickedAudio)

  const renderable = analysisBelongsToPickedAudio && hasRenderablePayload(analysis)
  const terminal = Boolean(analysis && analysisBelongsToPickedAudio && isTerminalStatus(analysis.status))
  const successLike = Boolean(analysis && analysisBelongsToPickedAudio && isSuccessLikeStatus(analysis.status))

  const isRunning = Boolean(loading)

  // ── Fallback visibility flags ───────────────────────────────────────
  const showNoPayloadFallback =
    hasAttempted &&
    !isRunning &&
    !error &&
    !analysis &&
    status !== 'idle' &&
    status !== 'loading'

  const showRenderableAnalysis = !isRunning && Boolean(analysis) && renderable

  const showTerminalFallback =
    !isRunning && Boolean(analysis) && analysisBelongsToPickedAudio && !renderable && terminal

  const showMismatchFallback =
    hasAttempted &&
    !isRunning &&
    !error &&
    Boolean(analysis) &&
    !analysisBelongsToPickedAudio &&
    !showRenderableAnalysis &&
    !showTerminalFallback

  const normalizedFallbackStatus =
    isRunning ? 'loading' : showNoPayloadFallback ? 'completed' : status

  // ── Side effects ────────────────────────────────────────────────────
  useEffect(() => {
    setSelectedPart('all')
  }, [analysis?.analysisId])

  useEffect(() => {
    if (!loading) {
      setActiveStepIndex(0)
      return
    }

    setActiveStepIndex(0)

    const timers: number[] = []

    const schedule = [900, 2200, 4200, 7000, 10500]
    schedule.forEach((delay, index) => {
      timers.push(
        window.setTimeout(() => {
          setActiveStepIndex(Math.min(index + 1, 4))
        }, delay),
      )
    })

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [loading])

  // ── Chunk-derived metrics ───────────────────────────────────────────
  const chunkRows = useMemo(() => {
    if (!analysis || !analysisBelongsToPickedAudio) return []
    if (selectedPart === 'all') return analysis.chunkTable ?? []
    return (analysis.chunkTable ?? []).filter((row) => row.partNumber === selectedPart)
  }, [analysis, analysisBelongsToPickedAudio, selectedPart])

  const confidenceData = useMemo(() => buildConfidenceData(chunkRows), [chunkRows])
  const snrData = useMemo(() => buildSnrData(chunkRows), [chunkRows])
  const correctionData = useMemo(() => buildCorrectionData(chunkRows), [chunkRows])
  const confidenceTrend = useMemo(() => buildConfidenceTrend(chunkRows), [chunkRows])

  const hasConfidenceData = confidenceData.length > 0
  const hasSequenceData =
    analysisBelongsToPickedAudio && (analysis?.charts?.sequenceProgress?.length ?? 0) > 0
  const hasSignalQualityData = snrData.some((item) => item.signalQuality != null)
  const hasCorrectionData = correctionData.some((item) => item.correctionCount > 0)
  const hasConfidenceTrend = confidenceTrend.length > 0
  const showPayloadStructure = analysisBelongsToPickedAudio && hasPayloadStructure(analysis)
  const showCompare = analysisBelongsToPickedAudio && hasCompareEvidence(analysis)
  const showDiagnostics = analysisBelongsToPickedAudio && hasDiagnostics(analysis, chunkRows)

  // ── Handlers ────────────────────────────────────────────────────────
  async function handleAnalyzeClick() {
    if (!pickedAudio || loading) return
    await onAnalyzeAudio(pickedAudio, { force: true })
  }

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <AnalysisTopBar
        options={options}
        pickerKey={pickerKey}
        onPickerChange={setPickerKey}
        pickedAudio={pickedAudio}
        sourceLabel={sourceLabel}
        loading={loading}
        error={error}
        onAnalyzeClick={handleAnalyzeClick}
      />

      {isRunning ? (
        <AnalysisPipelineState
          sourceType={sourceLabel}
          selectedAudio={pickedAudio}
          activeStepIndex={activeStepIndex}
        />
      ) : null}

      {error && hasAttempted && !isRunning && !analysis ? (
        <AnalysisErrorState error={error} />
      ) : null}

      {showMismatchFallback ? (
        <AnalysisMismatchState
          analysis={analysis as AnalysisPayload}
          selectedAudio={pickedAudio}
          onRetry={handleAnalyzeClick}
          retryDisabled={!pickedAudio || Boolean(loading)}
        />
      ) : null}

      {showTerminalFallback ? (
        <TerminalAnalysisState
          analysis={analysis as AnalysisPayload}
          onRetry={handleAnalyzeClick}
          retryDisabled={!pickedAudio || Boolean(loading)}
        />
      ) : null}

      {showNoPayloadFallback ? (
        <EmptyResolvedAnalysisState
          status={normalizedFallbackStatus}
          onRetry={handleAnalyzeClick}
          retryDisabled={!pickedAudio}
        />
      ) : null}

      {showRenderableAnalysis ? (
        <>
          <AnalysisSummaryBanner analysis={analysis as AnalysisPayload} successLike={successLike} />

          <div className="grid gap-4 xl:grid-cols-[1.06fr_0.94fr]">
            <RecoveryVerdictCard analysis={analysis as AnalysisPayload} />
            <RecoveredMessageCard analysis={analysis as AnalysisPayload} recoveredText={recoveryText} />
          </div>

          {hasConfidenceData || hasSequenceData || hasSignalQualityData ? (
            <div className="grid gap-4 xl:grid-cols-3">
              {hasConfidenceData ? (
                <div className="xl:col-span-1">
                  <ChunkConfidenceCard data={confidenceData} />
                </div>
              ) : null}

              {hasSequenceData ? (
                <div className="xl:col-span-1">
                  <RecoverySequenceCard items={(analysis as AnalysisPayload).charts.sequenceProgress} />
                </div>
              ) : null}

              {hasSignalQualityData ? (
                <div className="xl:col-span-1">
                  <SignalQualityCard data={snrData} />
                </div>
              ) : null}
            </div>
          ) : null}

          {hasCorrectionData || hasConfidenceTrend ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {hasCorrectionData ? <CorrectionImpactCard data={correctionData} /> : null}
              {hasConfidenceTrend ? <ConfidenceTrendCard data={confidenceTrend} /> : null}
            </div>
          ) : null}

          {showPayloadStructure ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <PayloadStructureCard structure={(analysis as AnalysisPayload).charts.payloadStructure} />
            </div>
          ) : null}

          {showCompare ? (
            <CoverStegoCompareSection
              analysis={analysis as AnalysisPayload}
              selectedPart={selectedPart}
              onSelectPart={setSelectedPart}
            />
          ) : null}

          {showDiagnostics ? (
            <AdvancedDiagnosticsSection analysis={analysis as AnalysisPayload} chunkRows={chunkRows} />
          ) : null}
        </>
      ) : null}

      {!analysis && !isRunning && !hasAttempted && !error ? (
        <EmptyAnalysisState />
      ) : null}
    </div>
  )
}
