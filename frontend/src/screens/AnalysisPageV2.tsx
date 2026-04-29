import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Circle, Loader2, Minus } from 'lucide-react'
import { Panel, Stat } from '../components/AuraPrimitives'
import {
  AdvancedDiagnosticsSection,
  ChunkConfidenceCard,
  ConfidenceTrendCard,
  CorrectionImpactCard,
  CoverStegoCompareSection,
  EmptyAnalysisState,
  PayloadStructureCard,
  RecoveredMessageCard,
  RecoverySequenceCard,
  RecoveryVerdictCard,
  SignalQualityCard,
} from '../components/analysis/ForensicCards'
import type { AnalysisPayload, SelectedAudio } from '../types'

const TERMINAL_ANALYSIS_STATUSES = new Set([
  'complete',
  'completed',
  'partial',
  'failed',
  'timed_out',
  'invalid_target',
  'missing_source',
  'not_found',
  'cancelled',
])

const SUCCESS_ANALYSIS_STATUSES = new Set(['complete', 'completed', 'partial'])

type AnalysisStepState = 'pending' | 'running' | 'complete' | 'skipped' | 'failed'

type AnalysisPipelineStep = {
  key: string
  title: string
  caption: string
  runningText: string
}

const ANALYSIS_PIPELINE_STEPS: AnalysisPipelineStep[] = [
  {
    key: 'target_accept',
    title: 'Target accepted',
    caption: 'The selected audio or transmission has been locked for analysis.',
    runningText: 'Locking the selected Aura target for forensic analysis...',
  },
  {
    key: 'source_classification',
    title: 'Source classification',
    caption: 'Classify the target as single audio, grouped transmission, or normalized single-part.',
    runningText: 'Classifying source semantics and transmission shape...',
  },
  {
    key: 'transmission_resolution',
    title: 'Transmission resolution',
    caption: 'Resolve the analysis scope, sibling parts, and ordered sequence.',
    runningText: 'Resolving grouped transmission and collecting ordered parts...',
  },
  {
    key: 'signal_loading',
    title: 'Signal loading',
    caption: 'Load the required audio file or grouped carrier segments.',
    runningText: 'Loading carrier signal data for inspection...',
  },
  {
    key: 'recovery_inspection',
    title: 'Recovery inspection',
    caption: 'Inspect decode and recovery evidence across the selected scope.',
    runningText: 'Inspecting recovery evidence across the sequence...',
  },
  {
    key: 'metrics_extraction',
    title: 'Metrics extraction',
    caption: 'Build chunk confidence, integrity, payload structure, and signal metrics.',
    runningText: 'Extracting chunk confidence and integrity metrics...',
  },
  {
    key: 'compare_artifacts',
    title: 'Compare artifact generation',
    caption: 'Prepare cover/stego compare views when provenance is available.',
    runningText: 'Preparing compare artifacts where provenance is available...',
  },
  {
    key: 'final_verdict',
    title: 'Final verdict',
    caption: 'Build the final renderable forensic object for the UI.',
    runningText: 'Finalizing forensic verdict...',
  },
]

function isTerminalStatus(status?: string) {
  return TERMINAL_ANALYSIS_STATUSES.has((status || '').toLowerCase())
}

function isSuccessLikeStatus(status?: string) {
  return SUCCESS_ANALYSIS_STATUSES.has((status || '').toLowerCase())
}

function hasPayloadStructure(analysis: AnalysisPayload | null) {
  const structure = analysis?.charts?.payloadStructure
  if (!structure) return false
  return (
    structure.headerBlocks +
      structure.payloadBlocks +
      structure.redundancyBlocks +
      structure.ignoredTailBlocks +
      structure.duplicateBlocks >
    0
  )
}

function hasCompareEvidence(analysis: AnalysisPayload | null) {
  if (!analysis) return false
  return Boolean(
    analysis.provenance?.hasCoverStegoLink ||
      analysis.charts?.compareSpectrogram?.available ||
      analysis.charts?.waveformComparison?.available,
  )
}

function hasDiagnostics(analysis: AnalysisPayload | null, chunkRows: AnalysisPayload['chunkTable']) {
  if (!analysis) return false
  return (
    chunkRows.length > 0 ||
    (analysis.recovery?.changes?.length ?? 0) > 0 ||
    (analysis.provenance?.assets?.length ?? 0) > 0
  )
}

/**
 * IMPORTANT:
 * Aura analysis should render if *any* meaningful object exists.
 * We intentionally treat minimal backend payloads as renderable.
 */
function hasRenderablePayload(analysis: AnalysisPayload | null) {
  if (!analysis || typeof analysis !== 'object') return false

  if (
    analysis.summary ||
    analysis.recovery ||
    analysis.verdict ||
    analysis.metrics ||
    analysis.charts ||
    (analysis.chunkTable?.length ?? 0) > 0 ||
    (analysis.provenance?.assets?.length ?? 0) > 0
  ) {
    return true
  }

  return Boolean(
    analysis.status ||
      analysis.message ||
      analysis.reason ||
      analysis.mode ||
      analysis.sourceType ||
      analysis.analysisId ||
      analysis.transmissionId ||
      analysis.elapsedMs != null ||
      analysis.filesProcessed != null ||
      analysis.filesTotal != null ||
      (analysis.missingParts?.length ?? 0) > 0,
  )
}

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

function inferAudioSourceType(audio: SelectedAudio | null): 'single' | 'grouped' {
  if (!audio) return 'single'
  if (audio.analysisSourceType) return audio.analysisSourceType

  const fileName = audio.selectedPartFilename || audio.fileName || ''
  const partMatch = fileName.match(/^tx_[^_]+_part_(\d+)_of_(\d+)\.wav$/i)

  if (partMatch) {
    const totalParts = Number(partMatch[2])
    return Number.isFinite(totalParts) && totalParts > 1 ? 'grouped' : 'single'
  }

  if (audio.mode === 'multi') return 'grouped'
  if ((audio.totalSegments ?? 0) > 1) return 'grouped'
  if ((audio.segments?.length ?? 0) > 1) return 'grouped'

  return 'single'
}

function parseTransmissionInfo(audio: SelectedAudio | null) {
  const fileName = audio?.selectedPartFilename || audio?.fileName || ''
  const match = fileName.match(/^tx_([^_]+)_part_(\d+)_of_(\d+)\.wav$/i)

  if (!match) {
    return {
      transmissionIdFromFile: null as string | null,
      partNumberFromFile: null as number | null,
      totalPartsFromFile: null as number | null,
    }
  }

  return {
    transmissionIdFromFile: match[1],
    partNumberFromFile: Number(match[2]),
    totalPartsFromFile: Number(match[3]),
  }
}

/**
 * IMPORTANT:
 * Grouped analysis payloads should be considered valid for any selected part
 * belonging to the same transmission.
 *
 * This is the key fix that stops false "No analysis payload was returned".
 */
function analysisMatchesAudio(analysis: AnalysisPayload | null, audio: SelectedAudio | null) {
  if (!analysis || !audio) return false

  const sourceType = inferAudioSourceType(audio)
  const fileName = audio.selectedPartFilename || audio.fileName || ''
  const { transmissionIdFromFile } = parseTransmissionInfo(audio)

  const audioTransmissionId =
    audio.transmissionId || transmissionIdFromFile || null

  const analysisTransmissionId = analysis.transmissionId || null
  const analysisMode = (analysis.mode || '').toLowerCase()
  const analysisSourceType = (analysis.sourceType || '').toLowerCase()

  // 1) Strongest match: exact selected file returned by backend
  if (analysis.selectedPartFilename && analysis.selectedPartFilename === fileName) {
    return true
  }

  // 2) Grouped semantics: any payload for same transmission belongs to this picked part
  if (
    sourceType === 'grouped' &&
    audioTransmissionId &&
    analysisTransmissionId &&
    analysisTransmissionId.toLowerCase() === audioTransmissionId.toLowerCase()
  ) {
    return true
  }

  // 3) If backend explicitly says grouped and transmission IDs align, accept
  if (
    (analysisMode === 'grouped' || analysisSourceType === 'grouped') &&
    audioTransmissionId &&
    analysisTransmissionId &&
    analysisTransmissionId.toLowerCase() === audioTransmissionId.toLowerCase()
  ) {
    return true
  }

  // 4) Legacy message id fallback
  if (analysis.legacy?.message_id && audio.messageId) {
    if (String(analysis.legacy.message_id) === String(audio.messageId)) {
      return true
    }
  }

  // 5) analysisId fallback
  if (analysis.analysisId && audio.messageId) {
    if (analysis.analysisId.includes(String(audio.messageId))) {
      return true
    }
  }

  // 6) Last resort: single-file match by exact file name inside analysisId
  if (analysis.analysisId && fileName && analysis.analysisId.includes(fileName)) {
    return true
  }

  return false
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
  const options = useMemo(() => {
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

  /**
   * Only show "No payload" if:
   * - user attempted
   * - not loading
   * - no visible error
   * - no analysis object at all
   * - status is non-neutral
   *
   * If analysis exists but doesn't match, do NOT show "No payload" anymore.
   * Show a safer mismatch state instead.
   */
  const showNoPayloadFallback =
    hasAttempted &&
    !isRunning &&
    !error &&
    !analysis &&
    status !== 'idle' &&
    status !== 'loading'

  /**
   * If analysis exists and belongs to the picked audio and is renderable,
   * always render it.
   */
  const showRenderableAnalysis = !isRunning && Boolean(analysis) && renderable

  /**
   * If analysis exists for the current target and is terminal but not renderable,
   * show terminal fallback.
   */
  const showTerminalFallback =
    !isRunning && Boolean(analysis) && analysisBelongsToPickedAudio && !renderable && terminal

  /**
   * IMPORTANT:
   * Distinguish "we have an analysis object but UI thinks it belongs elsewhere"
   * from "no payload".
   */
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

  useEffect(() => {
    setSelectedPart('all')
  }, [analysis?.analysisId])

  /**
   * UX FIX:
   * Slow, believable progress.
   * Cap before late-stage cards while still loading.
   */
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

  const chunkRows = useMemo(() => {
    if (!analysis || !analysisBelongsToPickedAudio) return []
    if (selectedPart === 'all') return analysis.chunkTable ?? []
    return (analysis.chunkTable ?? []).filter((row) => row.partNumber === selectedPart)
  }, [analysis, analysisBelongsToPickedAudio, selectedPart])

  const confidenceData = useMemo(
    () =>
      chunkRows.map((row) => ({
        chunkIndex: row.chunkIndex,
        confidence: row.confidence ?? 0,
        status: row.status,
      })),
    [chunkRows],
  )

  const snrData = useMemo(
    () =>
      chunkRows.map((row) => ({
        chunkIndex: row.chunkIndex,
        signalQuality:
          row.snrDb ??
          (row.stftDeltaScore != null
            ? Math.max(0, 100 - row.stftDeltaScore * 1000)
            : row.mse != null
              ? Math.max(0, 100 - row.mse * 100000)
              : null),
      })),
    [chunkRows],
  )

  const correctionData = useMemo(
    () =>
      chunkRows.map((row) => ({
        chunkIndex: row.chunkIndex,
        correctionCount: row.correctionCount,
      })),
    [chunkRows],
  )

  const confidenceTrend = useMemo(
    () => chunkRows.map((row) => ({ chunkIndex: row.chunkIndex, confidence: row.confidence ?? 0 })),
    [chunkRows],
  )

  const hasConfidenceData = confidenceData.length > 0
  const hasSequenceData =
    analysisBelongsToPickedAudio && (analysis?.charts?.sequenceProgress?.length ?? 0) > 0
  const hasSignalQualityData = snrData.some((item) => item.signalQuality != null)
  const hasCorrectionData = correctionData.some((item) => item.correctionCount > 0)
  const hasConfidenceTrend = confidenceTrend.length > 0
  const showPayloadStructure = analysisBelongsToPickedAudio && hasPayloadStructure(analysis)
  const showCompare = analysisBelongsToPickedAudio && hasCompareEvidence(analysis)
  const showDiagnostics = analysisBelongsToPickedAudio && hasDiagnostics(analysis, chunkRows)

  async function handleAnalyzeClick() {
    if (!pickedAudio || loading) return
    await onAnalyzeAudio(pickedAudio, { force: true })
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
              {pickedAudio?.fileName || 'Select an audio message to begin'}
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

function AnalysisSummaryBanner({
  analysis,
  successLike,
}: {
  analysis: AnalysisPayload
  successLike: boolean
}) {
  const normalizedStatus = (analysis.status || '').toLowerCase()

  const title = successLike
    ? 'Analysis completed successfully'
    : normalizedStatus === 'failed'
      ? 'Analysis completed with issues'
      : 'Analysis completed'

  const message =
    analysis.message ||
    analysis.reason ||
    analysis.summary?.trustMessage ||
    (successLike
      ? 'Aura produced a renderable forensic object and the analysis page is showing all available evidence.'
      : 'Aura returned a partial or reduced forensic object. Available evidence is shown below.')

  const processed = analysis.filesProcessed ?? analysis.summary?.filesProcessed ?? '—'
  const total = analysis.filesTotal ?? analysis.summary?.filesTotal ?? '—'

  return (
    <div className="rounded-2xl border border-aura-reveal/14 bg-aura-reveal/8 px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aura-reveal">
            Analysis status
          </div>
          <div className="mt-1 text-sm font-semibold text-aura-text">{title}</div>
          <p className="mt-1 text-sm leading-6 text-aura-muted">{message}</p>
        </div>

        <div className="grid gap-2 text-xs text-aura-muted sm:grid-cols-3 lg:min-w-[420px]">
          <Stat label="Status" value={analysis.status || 'completed'} />
          <Stat label="Files" value={`${processed} / ${total}`} />
          <Stat
            label="Elapsed"
            value={analysis.elapsedMs ? `${(analysis.elapsedMs / 1000).toFixed(1)}s` : '—'}
          />
        </div>
      </div>

      {(analysis.missingParts?.length ?? 0) > 0 ? (
        <div className="mt-3 rounded-2xl border border-aura-danger/20 bg-aura-danger/10 px-4 py-3 text-sm text-aura-danger">
          Missing {analysis.missingParts?.map((part) => `Part ${part}`).join(', ')}
        </div>
      ) : null}
    </div>
  )
}

function EmptyResolvedAnalysisState({
  status,
  onRetry,
  retryDisabled,
}: {
  status: string
  onRetry: () => Promise<void> | void
  retryDisabled: boolean
}) {
  return (
    <Panel className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aura-dim/90">
            Analysis completed
          </div>
          <h2 className="mt-2 text-xl font-semibold text-aura-text">
            No analysis payload was returned
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-aura-muted">
            Aura finished the request, but the backend did not return a usable analysis object for this item.
            This usually means the backend settled without producing a renderable payload.
          </p>
        </div>

        <div className="rounded-2xl border border-aura-border/10 bg-aura-bg/35 px-4 py-3 text-sm text-aura-muted">
          <div>
            Status: <span className="font-semibold text-aura-text">{status}</span>
          </div>
          <div className="mt-1">
            State: <span className="font-semibold text-aura-text">No payload</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onRetry}
        disabled={retryDisabled}
        className="mt-5 rounded-2xl border border-aura-reveal/18 bg-aura-reveal/10 px-5 py-2.5 text-sm font-semibold text-aura-reveal transition-all hover:bg-aura-reveal/14 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Retry analysis
      </button>
    </Panel>
  )
}

function AnalysisMismatchState({
  analysis,
  selectedAudio,
  onRetry,
  retryDisabled,
}: {
  analysis: AnalysisPayload
  selectedAudio: SelectedAudio | null
  onRetry: () => Promise<void> | void
  retryDisabled: boolean
}) {
  const selectedFile = selectedAudio?.selectedPartFilename || selectedAudio?.fileName || 'Unknown'
  const analysisTarget =
    analysis.selectedPartFilename ||
    analysis.transmissionId ||
    analysis.analysisId ||
    'Unknown'

  return (
    <Panel className="p-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aura-dim/90">
        Analysis returned
      </div>
      <h2 className="mt-2 text-xl font-semibold text-aura-text">
        Analysis completed, but target mapping did not align
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-aura-muted">
        Aura returned an analysis object, but the frontend could not confidently map it to the currently selected audio.
        This is usually a grouped-vs-single target identity mismatch, not a backend failure.
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-aura-border/10 bg-aura-bg/35 px-4 py-3 text-sm text-aura-muted">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aura-dim/90">
            Selected audio
          </div>
          <div className="mt-2 text-aura-text">{selectedFile}</div>
        </div>

        <div className="rounded-2xl border border-aura-border/10 bg-aura-bg/35 px-4 py-3 text-sm text-aura-muted">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aura-dim/90">
            Analysis target
          </div>
          <div className="mt-2 text-aura-text">{analysisTarget}</div>
        </div>
      </div>

      <button
        type="button"
        onClick={onRetry}
        disabled={retryDisabled}
        className="mt-5 rounded-2xl border border-aura-reveal/18 bg-aura-reveal/10 px-5 py-2.5 text-sm font-semibold text-aura-reveal transition-all hover:bg-aura-reveal/14 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Retry analysis
      </button>
    </Panel>
  )
}

function AnalysisPipelineState({
  sourceType,
  selectedAudio,
  activeStepIndex,
}: {
  sourceType: string
  selectedAudio: SelectedAudio | null
  activeStepIndex: number
}) {
  const expectedFiles =
    sourceType === 'grouped'
      ? selectedAudio?.totalSegments ||
        selectedAudio?.segments?.length ||
        parseTotalParts(selectedAudio?.fileName) ||
        'Resolving'
      : 1

  const activeStep = ANALYSIS_PIPELINE_STEPS[activeStepIndex] ?? ANALYSIS_PIPELINE_STEPS[0]

  const progress = Math.min(
    84,
    Math.round(((activeStepIndex + 0.65) / ANALYSIS_PIPELINE_STEPS.length) * 100),
  )

  return (
    <Panel className="overflow-hidden p-0">
      <div className="border-b border-aura-border/8 px-5 py-4 lg:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aura-reveal">
              Forensic analysis running
            </div>
            <h2 className="mt-1 text-lg font-semibold text-aura-text">
              {activeStep.title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-aura-muted">{activeStep.runningText}</p>
          </div>

          <div className="grid gap-2 text-xs text-aura-muted sm:grid-cols-3 lg:min-w-[420px]">
            <Stat label="Mode" value={sourceType} />
            <Stat label="Files expected" value={expectedFiles} />
            <Stat label="Stage" value={`${activeStepIndex + 1} / ${ANALYSIS_PIPELINE_STEPS.length}`} />
          </div>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-aura-bg/45">
          <div
            className="h-full rounded-full bg-aura-reveal transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="grid gap-2 p-4 lg:grid-cols-2 lg:p-5 xl:grid-cols-4">
        {ANALYSIS_PIPELINE_STEPS.map((step, index) => {
          const state: AnalysisStepState =
            index < activeStepIndex ? 'complete' : index === activeStepIndex ? 'running' : 'pending'
          return <AnalysisPipelineStepCard key={step.key} step={step} state={state} />
        })}
      </div>
    </Panel>
  )
}

function AnalysisPipelineStepCard({
  step,
  state,
}: {
  step: AnalysisPipelineStep
  state: AnalysisStepState
}) {
  const icon =
    state === 'complete' ? (
      <Check size={14} />
    ) : state === 'running' ? (
      <Loader2 size={14} className="animate-spin" />
    ) : state === 'skipped' ? (
      <Minus size={14} />
    ) : (
      <Circle size={14} />
    )

  return (
    <div
      className={[
        'rounded-2xl border px-4 py-3 transition-all duration-300',
        state === 'running'
          ? 'border-aura-reveal/24 bg-aura-reveal/10 shadow-[0_0_24px_rgba(114,209,199,0.10)]'
          : state === 'complete'
            ? 'border-aura-reveal/14 bg-aura-bg/30'
            : 'border-aura-border/8 bg-aura-bg/20 opacity-70',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span
          className={[
            'inline-flex h-7 w-7 items-center justify-center rounded-full border',
            state === 'running'
              ? 'border-aura-reveal/25 bg-aura-reveal/12 text-aura-reveal'
              : state === 'complete'
                ? 'border-aura-reveal/18 bg-aura-reveal/10 text-aura-reveal'
                : 'border-aura-border/10 bg-aura-bg/35 text-aura-dim',
          ].join(' ')}
        >
          {icon}
        </span>

        <div className="text-sm font-semibold text-aura-text">{step.title}</div>
      </div>

      <p className="mt-2 text-xs leading-5 text-aura-muted">{step.caption}</p>
    </div>
  )
}

function parseTotalParts(fileName?: string) {
  const match = (fileName || '').match(/^tx_[^_]+_part_\d+_of_(\d+)\.wav$/i)
  if (!match) return undefined
  const total = Number(match[1])
  return Number.isFinite(total) && total > 0 ? total : undefined
}

function AnalysisErrorState({ error }: { error: string }) {
  return (
    <Panel className="p-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aura-danger">
        Analysis failed
      </div>
      <h2 className="mt-2 text-xl font-semibold text-aura-text">
        Analysis could not complete
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-aura-muted">{error}</p>
    </Panel>
  )
}

function TerminalAnalysisState({
  analysis,
  onRetry,
  retryDisabled,
}: {
  analysis: AnalysisPayload
  onRetry: () => Promise<void> | void
  retryDisabled: boolean
}) {
  const titleByStatus: Record<string, string> = {
    partial: 'Partial analysis completed',
    failed: 'Analysis failed',
    timed_out: 'Analysis timed out',
    invalid_target: 'Invalid analysis target',
    missing_source: 'Missing source audio',
    not_found: 'Analysis target not found',
    cancelled: 'Analysis cancelled',
    complete: 'Analysis completed',
    completed: 'Analysis completed',
  }

  const status = analysis.status
  const reason =
    analysis.reason ||
    analysis.message ||
    analysis.summary?.trustMessage ||
    'Analysis reached a terminal non-success state.'

  const missingParts = analysis.missingParts ?? []
  const processed = analysis.filesProcessed ?? analysis.summary?.filesProcessed ?? '—'
  const total = analysis.filesTotal ?? analysis.summary?.filesTotal ?? '—'

  return (
    <Panel className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aura-dim/90">
            Analysis status
          </div>
          <h2 className="mt-2 text-xl font-semibold text-aura-text">
            {titleByStatus[status] ?? status}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-aura-muted">{reason}</p>
          {analysis.errorCode ? (
            <div className="mt-3 font-mono text-xs text-aura-dim">{analysis.errorCode}</div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-aura-border/10 bg-aura-bg/35 px-4 py-3 text-sm text-aura-muted">
          <div>
            Status: <span className="font-semibold text-aura-text">{status}</span>
          </div>
          <div className="mt-1">
            Files: {processed} / {total}
          </div>
          {analysis.elapsedMs ? (
            <div className="mt-1">Elapsed: {(analysis.elapsedMs / 1000).toFixed(1)}s</div>
          ) : null}
        </div>
      </div>

      {missingParts.length ? (
        <div className="mt-4 rounded-2xl border border-aura-danger/20 bg-aura-danger/10 px-4 py-3 text-sm text-aura-danger">
          Missing {missingParts.map((part) => `Part ${part}`).join(', ')}
        </div>
      ) : null}

      {analysis.summary?.recoveredText ? (
        <div className="mt-4 rounded-2xl border border-aura-reveal/16 bg-aura-reveal/8 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aura-reveal">
            Partial recovered text
          </div>
          <p className="mt-2 text-base font-semibold leading-7 text-aura-text">
            {analysis.summary.recoveredText}
          </p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onRetry}
        disabled={retryDisabled}
        className="mt-5 rounded-2xl border border-aura-reveal/18 bg-aura-reveal/10 px-5 py-2.5 text-sm font-semibold text-aura-reveal transition-all hover:bg-aura-reveal/14 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Retry analysis
      </button>
    </Panel>
  )
}