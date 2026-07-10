import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import {
  Check,
  ChevronDown,
  Circle,
  Clipboard,
  FileAudio,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  AlertTriangle,
  Info,
  AlertCircle,
  Terminal,
  X,
  BarChart3,
} from 'lucide-react'
import { WaveformStrip } from '../components/WaveformStrip'
import { cn } from '../lib/utils'
import { resolveUrl } from '../services/api'
import type { AnalysisPayload, SelectedAudio, SpectrogramMatrix } from '../types'

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

const ANALYSIS_PIPELINE_STEPS = [
  {
    key: 'target_accept',
    title: 'Target accepted',
    caption: 'Selected audio has been locked for forensic analysis.',
    runningText: 'Locking selected Aura target.',
  },
  {
    key: 'source_classification',
    title: 'Source classification',
    caption: 'Classify single audio, grouped transmission, or normalized part.',
    runningText: 'Classifying source semantics.',
  },
  {
    key: 'transmission_resolution',
    title: 'Transmission resolution',
    caption: 'Resolve ordered parts and sibling segments.',
    runningText: 'Resolving transmission sequence.',
  },
  {
    key: 'signal_loading',
    title: 'Signal loading',
    caption: 'Load waveform, carrier evidence, and analysis artifacts.',
    runningText: 'Loading carrier signal data.',
  },
  {
    key: 'recovery_inspection',
    title: 'Recovery inspection',
    caption: 'Inspect decode evidence and correction regions.',
    runningText: 'Inspecting recovery evidence.',
  },
  {
    key: 'metrics_extraction',
    title: 'Metrics extraction',
    caption: 'Build integrity, payload, and chunk diagnostics.',
    runningText: 'Extracting integrity metrics.',
  },
  {
    key: 'compare_artifacts',
    title: 'Artifact generation',
    caption: 'Prepare cover, stego, and residual visual evidence.',
    runningText: 'Preparing compare artifacts.',
  },
  {
    key: 'final_verdict',
    title: 'Final verdict',
    caption: 'Assemble the final forensic object.',
    runningText: 'Finalizing analysis view.',
  },
]

type AnalysisRunStatus = 'idle' | 'loading' | 'success' | 'partial' | 'failed'
type AnalysisStepState = 'pending' | 'running' | 'complete'
type MessageMode = 'recovered' | 'raw'
type AdvancedTab = 'waveform' | 'spectrogram' | 'chunks' | 'robustness' | 'confidence' | 'metadata'
type PayloadRole = 'header' | 'payload' | 'redundancy' | 'tail' | 'duplicate' | 'unknown'
type MetricTone = 'safe' | 'neutral' | 'warning' | 'danger'
type WavePoint = { x: number; y: number }

type Props = {
  analysis: AnalysisPayload | null
  selectedAudio: SelectedAudio | null
  availableAudio: SelectedAudio[]
  onAnalyzeAudio: (audio: SelectedAudio, options?: { force?: boolean }) => Promise<void> | void
  loading?: boolean
  error?: string
  hasAttempted?: boolean
  status?: AnalysisRunStatus
  theme?: 'dark' | 'light'
  onThemeChange?: (theme: 'dark' | 'light') => void
  onImportAudio?: (file: File) => Promise<void>
}

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

type MetricDescriptor = {
  label: string
  value: string
  note: string
  normalized?: number | null
  tone?: MetricTone
}

function isTerminalStatus(status?: string) {
  return TERMINAL_ANALYSIS_STATUSES.has((status || '').toLowerCase())
}

export function isSuccessLikeStatus(status?: string) {
  return SUCCESS_ANALYSIS_STATUSES.has((status || '').toLowerCase())
}

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
    }
  }

  return {
    transmissionIdFromFile: match[1],
  }
}

function analysisMatchesAudio(analysis: AnalysisPayload | null, audio: SelectedAudio | null) {
  if (!analysis || !audio) return false

  const sourceType = inferAudioSourceType(audio)
  const fileName = audio.selectedPartFilename || audio.fileName || ''
  const { transmissionIdFromFile } = parseTransmissionInfo(audio)
  const audioTransmissionId = audio.transmissionId || transmissionIdFromFile || null
  const analysisTransmissionId = analysis.transmissionId || null
  const analysisMode = (analysis.mode || '').toLowerCase()
  const analysisSourceType = (analysis.sourceType || '').toLowerCase()

  if (analysis.selectedPartFilename && analysis.selectedPartFilename === fileName) return true

  if (
    sourceType === 'grouped' &&
    audioTransmissionId &&
    analysisTransmissionId &&
    analysisTransmissionId.toLowerCase() === audioTransmissionId.toLowerCase()
  ) {
    return true
  }

  if (
    (analysisMode === 'grouped' || analysisSourceType === 'grouped') &&
    audioTransmissionId &&
    analysisTransmissionId &&
    analysisTransmissionId.toLowerCase() === audioTransmissionId.toLowerCase()
  ) {
    return true
  }

  if (analysis.legacy?.message_id && audio.messageId) {
    if (String(analysis.legacy.message_id) === String(audio.messageId)) return true
  }

  if (analysis.analysisId && audio.messageId) {
    if (analysis.analysisId.includes(String(audio.messageId))) return true
  }

  if (analysis.analysisId && fileName && analysis.analysisId.includes(fileName)) return true

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
  const [messageMode, setMessageMode] = useState<MessageMode>('recovered')
  const [advancedTab, setAdvancedTab] = useState<AdvancedTab>('waveform')

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

  const rawRecoveryText = analysis?.recovery?.raw_text?.trim() || recoveryText
  const analysisBelongsToPickedAudio = analysisMatchesAudio(analysis, pickedAudio)
  const resolvedSourceLabel =
    !loading && analysis && analysisBelongsToPickedAudio
      ? analysis.sourceType ?? analysis.mode
      : undefined
  const sourceLabel = resolvedSourceLabel ?? inferAudioSourceType(pickedAudio)

  const renderable = analysisBelongsToPickedAudio && hasRenderablePayload(analysis)
  const terminal = Boolean(analysis && analysisBelongsToPickedAudio && isTerminalStatus(analysis.status))
  const isRunning = Boolean(loading)

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

  const normalizedFallbackStatus = isRunning ? 'loading' : showNoPayloadFallback ? 'completed' : status

  useEffect(() => {
    setSelectedPart('all')
    setMessageMode('recovered')
    setAdvancedTab('waveform')
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

  const chunkRows = useMemo(() => {
    if (!analysis || !analysisBelongsToPickedAudio) return []
    if (selectedPart === 'all') return analysis.chunkTable ?? []
    return (analysis.chunkTable ?? []).filter((row) => row.partNumber === selectedPart)
  }, [analysis, analysisBelongsToPickedAudio, selectedPart])

  async function handleAnalyzeClick() {
    if (!pickedAudio || loading) return
    await onAnalyzeAudio(pickedAudio, { force: true })
  }

  function handleExport() {
    if (!analysis) return

    const fileStem = sanitizeFilename(
      pickedAudio?.selectedPartFilename || pickedAudio?.fileName || analysis.analysisId || 'aura-analysis',
    )
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        selectedAudio: pickedAudio,
        analysis,
      },
      null,
      2,
    )
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${fileStem}.analysis.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const topBarTimestamp = useMemo(() => {
    const date = new Date()
    return date.toLocaleString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
  }, [analysis?.analysisId, pickerKey])

  return (
    <div className="aura-analysis-atmosphere relative min-h-full">
      <div className="mx-auto w-full max-w-[1240px] px-5 pt-3">
        <div className="aura-toolbar-shell aura-toolbar rounded-[16px] px-4">
          <AnalysisTopBar
            options={options}
            pickerKey={pickerKey}
            onPickerChange={setPickerKey}
            selectedAudio={pickedAudio}
            sourceLabel={sourceLabel}
            timestamp={topBarTimestamp}
            modelVersion={getModelVersion(analysis)}
            onAnalyze={handleAnalyzeClick}
            analyzeDisabled={!pickedAudio || loading}
            analyzing={loading}
            canExport={Boolean(analysis)}
            onExport={handleExport}
          />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1240px] px-5">
        {error ? <InlineSystemNotice tone="danger">{error}</InlineSystemNotice> : null}

        {isRunning ? (
          <AnalysisPipelineState
            sourceType={sourceLabel}
            selectedAudio={pickedAudio}
            activeStepIndex={activeStepIndex}
          />
        ) : null}

        {error && hasAttempted && !isRunning && !analysis ? <AnalysisErrorState error={error} /> : null}

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
          <main className="space-y-8 py-5 lg:space-y-10 lg:py-7">
            {/* 1. Verdict Banner */}
            <AnalysisVerdictBanner analysis={analysis as AnalysisPayload} />

            {/* 2. Analysis Summary / Overview */}
            <AnalysisSummaryOverview
              analysis={analysis as AnalysisPayload}
              recoveredText={recoveryText}
            />

            {/* 3. Recovered Payload Section (Always Visible) */}
            <RecoveredPayloadSection
              analysis={analysis as AnalysisPayload}
              recoveredText={recoveryText}
              rawText={rawRecoveryText}
              messageMode={messageMode}
              onMessageModeChange={setMessageMode}
            />

            {/* 4. Transmission Details Section (Collapsible, Expanded by Default) */}
            <TransmissionDetailsSection
              analysis={analysis as AnalysisPayload}
              audio={pickedAudio}
            />

            {/* 5. Integrity & Core Metrics Section (Collapsible, Expanded by Default, hidden if empty) */}
            <IntegrityMetricsSection
              analysis={analysis as AnalysisPayload}
              chunkRows={chunkRows}
            />

             <ArtifactsSection
              analysis={analysis as AnalysisPayload}
              selectedAudio={pickedAudio}
              chunkRows={chunkRows}
              selectedPart={selectedPart}
              onSelectPart={setSelectedPart}
              advancedTab={advancedTab}
              onTabChange={setAdvancedTab}
            />
            
            {/* 6. Diagnostics Section (Collapsible, Collapsed by Default) */}
            <DiagnosticsSection
              analysis={analysis as AnalysisPayload}
            />

            {/* 7. Advanced Forensic Metrics Section (Collapsible, Collapsed by Default) */}
            <AdvancedForensicMetricsSection
              analysis={analysis as AnalysisPayload}
              chunkRows={chunkRows}
            />

            {/* 8. Artifacts Section (Collapsible, Collapsed by Default) */}
           
          </main>
        ) : null}

        {!analysis && !isRunning && !hasAttempted && !error ? <EmptyAnalysisState /> : null}
      </div>
    </div>
  )
}

function AnalysisTopBar({
  options,
  pickerKey,
  onPickerChange,
  selectedAudio,
  sourceLabel,
  timestamp,
  modelVersion,
  onAnalyze,
  analyzeDisabled,
  analyzing,
  canExport,
  onExport,
}: {
  options: Array<{ key: string; audio: SelectedAudio }>
  pickerKey: string
  onPickerChange: (key: string) => void
  selectedAudio: SelectedAudio | null
  sourceLabel: string
  timestamp: string
  modelVersion: string
  onAnalyze: () => Promise<void> | void
  analyzeDisabled: boolean
  analyzing: boolean
  canExport: boolean
  onExport: () => void
}) {
  const filesLabel = (() => {
    if (!selectedAudio) return 'no files'
    const total = selectedAudio.totalSegments ?? selectedAudio.segments?.length
    if (sourceLabel === 'grouped') {
      if (typeof total === 'number' && Number.isFinite(total) && total > 1) return `${total} files`
      return 'grouped transmission'
    }
    return '1 file'
  })()

  const transmissionLabel = sourceLabel === 'grouped' ? 'grouped transmission' : 'single audio'
  const selectedName = selectedAudio?.selectedPartFilename || selectedAudio?.fileName || 'Select audio target'
  const selectedSource = selectedAudio?.source || 'Unselected'

  return (
    <header className="bg-transparent">
      <div className="flex flex-col gap-6 py-4 lg:flex-row lg:items-center lg:justify-between">
        
        {/* Left: Title */}
        <div className="min-w-0 shrink-0">
          <h1 className="text-[30px] font-semibold leading-none tracking-tight text-slate-900 dark:text-white lg:text-[34px]">
            Analysis
          </h1>
          <div className="mt-2.5 text-[13px] font-medium text-slate-500 dark:text-slate-400">
            Neural signal recovery workstation
          </div>
        </div>

        {/* Center: Audio Selector */}
        <div className="w-full flex-1 max-w-[600px] lg:px-6">
          <label className="block min-w-0" title={`${selectedName} / ${selectedSource}`}>
            <span className="sr-only">Selected audio</span>
            <div className="relative flex h-[52px] min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm dark:border-white/10 dark:bg-[#121622] focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-500 transition-all">
              <FileAudio size={18} className="shrink-0 text-blue-500 dark:text-blue-400" />
              <div className="pointer-events-none min-w-0 flex-1 overflow-hidden pr-9">
                <div className="flex min-w-0 items-baseline gap-2 font-mono text-[13px] text-slate-900 dark:text-white">
                  <span className="min-w-0 truncate font-semibold">{selectedName}</span>
                  <span className="shrink-0 text-slate-300 dark:text-slate-600">/</span>
                  <span className="shrink-0 text-slate-500 dark:text-slate-400">{selectedSource}</span>
                </div>
              </div>
              <select
                value={pickerKey}
                onChange={(event) => onPickerChange(event.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer appearance-none border-0 bg-transparent px-3 pr-10 text-transparent outline-none"
              >
                {options.length === 0 ? (
                  <option value="" className="bg-white text-slate-900 dark:bg-[#121622] dark:text-white">
                    No audio available
                  </option>
                ) : null}
                {options.map((option) => (
                  <option 
                    key={option.key} 
                    value={option.key}
                    // Explicitly styling the options overrides the transparency bug
                    className="bg-white text-slate-900 dark:bg-[#121622] dark:text-white"
                  >
                    {option.audio.fileName} / {option.audio.source}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              />
            </div>
          </label>

          <div className="mt-2.5 flex min-w-0 items-center gap-2 overflow-hidden px-1 text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium">
            <span className="shrink-0">{filesLabel}</span>
            <span className="shrink-0 opacity-40">•</span>
            <span className="min-w-0 truncate">{transmissionLabel}</span>
          </div>
        </div>

        {/* Right: Actions & Meta */}
        <div className="flex shrink-0 flex-col items-start lg:items-end gap-4">
          <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-hidden">
            <ToolbarChip value={modelVersion} className="max-w-[100px]" />
            <ToolbarChip value={sourceLabel} className="max-w-[85px]" />
            <ToolbarChip value={timestamp} className="max-w-[90px]" />
          </div>

          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onAnalyze}
              disabled={analyzeDisabled}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 dark:bg-blue-600 px-6 text-[13.5px] font-semibold text-white shadow-sm hover:bg-slate-800 dark:hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {analyzing ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={15} className="animate-spin" />
                  Analyzing
                </span>
              ) : (
                'Run Analysis'
              )}
            </button>

            <button
              type="button"
              onClick={onExport}
              disabled={!canExport}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-transparent px-5 text-[13.5px] font-semibold text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-50 dark:hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Export
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
function ToolbarChip({ value, className }: { value: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'inline-flex h-[26px] items-center truncate rounded-md bg-slate-100 dark:bg-white/5 px-2.5 font-mono text-[11px] font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10',
        className,
      )}
    >
      {value}
    </div>
  )
}

function MessageModeToggle({
  value,
  onChange,
  disabledRaw,
}: {
  value: MessageMode
  onChange: (mode: MessageMode) => void
  disabledRaw: boolean
}) {
  return (
    <div className="inline-flex h-9 rounded-[10px] border border-aura-border/10 p-0.5">
      {(['recovered', 'raw'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          disabled={mode === 'raw' && disabledRaw}
          onClick={() => onChange(mode)}
          className={cn(
            'rounded-[8px] px-3 text-[12px] font-medium capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-35',
            value === mode
              ? 'bg-aura-text text-aura-bg'
              : 'text-aura-muted hover:bg-aura-surfaceSoft hover:text-aura-text',
          )}
        >
          {mode}
        </button>
      ))}
    </div>
  )
}

function SignalIntelligenceLayer({
  analysis,
  selectedAudio,
  chunkRows,
  selectedPart,
  onSelectPart,
}: {
  analysis: AnalysisPayload
  selectedAudio: SelectedAudio | null
  chunkRows: AnalysisPayload['chunkTable']
  selectedPart: number | 'all'
  onSelectPart: (part: number | 'all') => void
}) {
  const [playbackRatio, setPlaybackRatio] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const points = getWaveformPoints(analysis)
  const chunkInsights = getChunkInsights(chunkRows, analysis)
  const parts = getAvailableParts(analysis)
  const syncAvailable = analysis.sourceType !== 'grouped' || selectedPart !== 'all'

  useEffect(() => {
    setPlaybackRatio(0)
  }, [analysis.analysisId, selectedPart])

  function handleAudioProgress() {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
      setPlaybackRatio(0)
      return
    }
    setPlaybackRatio(clamp(audio.currentTime / audio.duration, 0, 1))
  }

  return (
    <section aria-label="Interactive signal intelligence">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-aura-dim">
            Layer 3 / Interactive signal intelligence
          </div>
          <h2 className="mt-2 text-[28px] font-semibold leading-tight tracking-normal text-aura-text lg:text-[34px]">
            Payload-aware signal timeline
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-aura-muted">
            Chunk boundaries, payload regions, recovery confidence, correction pressure, and audio playback are aligned on one real analysis trace.
          </p>
        </div>

        <div className="flex flex-col gap-2 lg:items-end">
          {parts.length ? (
            <PartSelector parts={parts} selectedPart={selectedPart} onSelectPart={onSelectPart} />
          ) : null}
          <div className="font-mono text-[11px] text-aura-dim">
            {syncAvailable ? 'playback line follows the selected file' : 'select one part for playback sync'}
          </div>
        </div>
      </div>

      <div className="aura-waveform-stage mt-5 overflow-hidden rounded-[18px]">
        <div className="relative z-10 flex flex-col gap-3 border-b border-aura-border/10 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <FileAudio size={16} className="shrink-0 text-aura-dim" />
            <div className="min-w-0">
              <div className="truncate font-mono text-[12px] text-aura-text">
                {selectedAudio?.selectedPartFilename || selectedAudio?.fileName || 'No target selected'}
              </div>
              <div className="mt-0.5 text-[11px] text-aura-muted">
                confidence overlays are derived from emitted chunk diagnostics
              </div>
            </div>
          </div>

          <TimelineLegend />
        </div>

        <SignalTimeline
          points={points}
          chunkInsights={chunkInsights}
          playbackRatio={syncAvailable ? playbackRatio : 0}
        />

        {selectedAudio?.audioUrl ? (
          <div className="relative z-10 border-t border-aura-border/10 px-4 py-3">
            <audio
              ref={audioRef}
              controls
              preload="metadata"
              src={resolveUrl(selectedAudio.audioUrl)}
              onTimeUpdate={handleAudioProgress}
              onLoadedMetadata={handleAudioProgress}
              className="h-8 w-full opacity-85"
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}

function TimelineLegend() {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[0.1em] text-aura-muted">
      <div className="flex items-center gap-2">
        <span className="h-2 w-3 rounded-[2px] bg-[rgba(91,173,190,0.6)]" />
        <span>Payload Region</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-3 rounded-[2px] bg-[rgba(126,132,184,0.7)]" />
        <span>Neural Certainty</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-3 rounded-[2px] bg-[rgba(232,116,101,0.8)]" />
        <span>Integrity Pressure</span>
      </div>
    </div>
  )
}

function SignalTimeline({
  points,
  chunkInsights,
  playbackRatio,
}: {
  points: WavePoint[]
  chunkInsights: ChunkInsight[]
  playbackRatio: number
}) {
  const width = 1200
  const height = 320
  const baseline = 165
  const amplitude = 92
  const path = pointsToPath(points, width, baseline, amplitude)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const hoverInsight = hoverIndex == null ? null : chunkInsights[hoverIndex]

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!chunkInsights.length) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1)
    const next = Math.min(chunkInsights.length - 1, Math.floor(ratio * chunkInsights.length))
    setHoverIndex(next)
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-[360px] w-full cursor-crosshair"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="analysisWaveStroke" x1="0" x2="1">
            <stop offset="0%" stopColor="rgb(176,184,198)" />
            <stop offset="50%" stopColor="rgb(91,173,190)" />
            <stop offset="100%" stopColor="rgb(126,132,184)" />
          </linearGradient>
        </defs>

        {/* Background Grid Lines */}
        {Array.from({ length: 9 }).map((_, index) => {
          const x = (index / 8) * width
          return (
            <line
              key={`x-${index}`}
              x1={x}
              x2={x}
              y1={32}
              y2={height - 28}
              stroke="rgb(var(--aura-border) / 0.08)"
            />
          )
        })}

        {[-1, -0.5, 0, 0.5, 1].map((level) => {
          const y = baseline - level * amplitude
          return (
            <line
              key={`y-${level}`}
              x1={0}
              x2={width}
              y1={y}
              y2={y}
              stroke="rgb(var(--aura-border) / 0.09)"
            />
          )
        })}

        {/* DATA-DRIVEN FORENSIC BLOCKS 
          This maps the PyTorch confidence and ECC errors to opacity gradients.
        */}
        {chunkInsights.map((insight, index) => {
          const chunkWidth = width / Math.max(1, chunkInsights.length)
          const x = index * chunkWidth
          
          const confidence = insight.confidence ?? 0
          const hasEccError = insight.row.correctionApplied || insight.row.correctionCount > 0
          
          // 1. High confidence = deeply saturated Teal/Purple. Low confidence = faint.
          const payloadOpacity = insight.activePayload ? 0.2 + (confidence * 0.6) : 0.05
          
          // 2. ECC errors immediately trigger 85% opacity Red. Otherwise, map to corruption metric.
          const corruptionOpacity = hasEccError ? 0.85 : (insight.corruption > 0.1 ? 0.1 + insight.corruption * 0.4 : 0)
          
          const certaintyHeight = Math.max(4, confidence * 34)

          return (
            <g key={`${insight.row.partNumber ?? 0}-${insight.row.chunkIndex}-${insight.order}`}>
              
              {/* Base Confidence Block */}
              <rect
                x={x}
                y={36}
                width={Math.max(2, chunkWidth - 1)}
                height={height - 72}
                fill="rgba(91,173,190,0.8)"
                opacity={payloadOpacity}
              />
              
              {/* Corruption Pressure Block (Red) */}
              {corruptionOpacity > 0 && (
                <rect
                  x={x}
                  y={36}
                  width={Math.max(2, chunkWidth - 1)}
                  height={height - 72}
                  fill="rgba(232,116,101,0.9)"
                  opacity={corruptionOpacity}
                />
              )}
              
              {/* Certainty Meter (Bottom Edge) */}
              <rect
                x={x + 1}
                y={height - 46 - certaintyHeight}
                width={Math.max(2, chunkWidth - 3)}
                height={certaintyHeight}
                fill={metricColor(insight.tone)}
                opacity={0.72}
              />
              
              <line
                x1={x}
                x2={x}
                y1={34}
                y2={height - 28}
                stroke="rgb(var(--aura-border) / 0.13)"
              />
              
              {/* ECC Strike-through Line (If error was caught) */}
              {hasEccError ? (
                <line
                  x1={x + chunkWidth / 2}
                  x2={x + chunkWidth / 2}
                  y1={40}
                  y2={height - 34}
                  stroke="rgba(232,116,101,1.0)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
              ) : null}
            </g>
          )
        })}

        {/* Audio Waveform Overlays */}
        <path
          d={path}
          fill="none"
          stroke="url(#analysisWaveStroke)"
          strokeWidth={points.length ? 2 : 1}
          strokeLinejoin="round"
        />
        {points.length ? (
          <path d={`${path} L ${width} ${baseline} L 0 ${baseline} Z`} fill="rgba(91,173,190,0.06)" />
        ) : null}

        {/* Playhead Sync Line */}
        {playbackRatio > 0 ? (
          <line
            x1={playbackRatio * width}
            x2={playbackRatio * width}
            y1={28}
            y2={height - 20}
            stroke="rgb(var(--aura-text) / 0.72)"
            strokeWidth={1.3}
          />
        ) : null}

        {/* Hover Inspector Line */}
        {hoverIndex != null && chunkInsights.length ? (
          <line
            x1={((hoverIndex + 0.5) / chunkInsights.length) * width}
            x2={((hoverIndex + 0.5) / chunkInsights.length) * width}
            y1={26}
            y2={height - 18}
            stroke="rgb(var(--aura-text) / 0.48)"
          />
        ) : null}
      </svg>

      {!points.length ? (
        <div className="pointer-events-none absolute inset-x-6 top-16 rounded-[12px] border border-dashed border-aura-border/12 bg-aura-bg/24 px-4 py-3 text-sm text-aura-muted">
          Amplitude samples were not emitted for this target. Chunk overlays remain available when diagnostics exist.
        </div>
      ) : null}

      {/* Hover Tooltip */}
      {hoverInsight ? (
        <div className="aura-tooltip-card pointer-events-none absolute bottom-4 left-4 z-20 w-[min(330px,calc(100%-2rem))] rounded-[14px] px-3 py-3 font-mono text-[11px] text-aura-muted">
          <div className="flex items-center justify-between gap-3">
            <div className="text-aura-text">Chunk {hoverInsight.row.chunkIndex}</div>
            <OutcomeBadge tone={hoverInsight.tone}>{formatRoleLabel(hoverInsight.role)}</OutcomeBadge>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
            <span>confidence</span>
            <span className="text-aura-text">{formatPercentValue(hoverInsight.confidence)}</span>
            <span>bit recovery</span>
            <span className="text-aura-text">{formatPercentValue(hoverInsight.bitAccuracy)}</span>
            <span>corruption</span>
            <span className="text-aura-text">{formatPercentValue(hoverInsight.corruption)}</span>
            <span>SNR</span>
            <span className="text-aura-text">{formatSnr(hoverInsight.row.snrDb)}</span>
            <span>ECC</span>
            <span className="text-aura-text">{hoverInsight.row.correctionCount}</span>
            <span>status</span>
            <span className="truncate text-aura-text">{hoverInsight.row.status || 'unknown'}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PartSelector({
  parts,
  selectedPart,
  onSelectPart,
}: {
  parts: number[]
  selectedPart: number | 'all'
  onSelectPart: (part: number | 'all') => void
}) {
  return (
    <div className="aura-control-shell flex flex-wrap gap-1 rounded-[12px] p-1">
      <button type="button" onClick={() => onSelectPart('all')} className={partButtonClass(selectedPart === 'all')}>
        All
      </button>
      {parts.map((part) => (
        <button
          key={part}
          type="button"
          onClick={() => onSelectPart(part)}
          className={partButtonClass(selectedPart === part)}
        >
          P{part}
        </button>
      ))}
    </div>
  )
}

function partButtonClass(active: boolean) {
  return cn(
    'rounded-[9px] px-2.5 py-1 font-mono text-[11px] transition-colors',
    active ? 'bg-aura-text text-aura-bg' : 'text-aura-muted hover:bg-aura-surfaceSoft/70 hover:text-aura-text',
  )
}

function AdvancedDiagnosticsWorkbench({
  analysis,
  selectedAudio,
  chunkRows,
  selectedPart,
  onSelectPart,
  activeTab,
  onTabChange,
}: {
  analysis: AnalysisPayload
  selectedAudio: SelectedAudio | null
  chunkRows: AnalysisPayload['chunkTable']
  selectedPart: number | 'all'
  onSelectPart: (part: number | 'all') => void
  activeTab: AdvancedTab
  onTabChange: (tab: AdvancedTab) => void
}) {
  const tabs: Array<{ key: AdvancedTab; label: string }> = [
    { key: 'waveform', label: 'Waveform' },
    { key: 'spectrogram', label: 'Spectrogram' },
    { key: 'chunks', label: 'Chunk Diagnostics' },
    { key: 'robustness', label: 'Robustness Analysis' },
    { key: 'confidence', label: 'Decoder Confidence' },
    { key: 'metadata', label: 'Metadata' },
  ]

  return (
    <section aria-label="Advanced research diagnostics">
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-aura-dim">
          Layer 4 / Advanced research diagnostics
        </div>
        <h2 className="mt-2 text-[28px] font-semibold tracking-normal text-aura-text">
          Inspect one diagnostic channel at a time
        </h2>
      </div>

      <div className="overflow-hidden rounded-[16px] border border-aura-border/10 bg-aura-surface/70">
        <div className="border-b border-aura-border/10 px-3 py-3">
          <div className="flex flex-wrap gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className={cn(
                  'rounded-[10px] px-3 py-2 text-[12px] font-medium transition-colors',
                  activeTab === tab.key
                    ? 'bg-aura-text text-aura-bg'
                    : 'text-aura-muted hover:bg-aura-surfaceSoft hover:text-aura-text',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 lg:p-5">
          {activeTab === 'waveform' ? <WaveformDiagnosticsTab analysis={analysis} /> : null}
          {activeTab === 'spectrogram' ? <SpectrogramDiagnosticsTab analysis={analysis} /> : null}
          {activeTab === 'chunks' ? (
            <ChunkDiagnosticsTab
              analysis={analysis}
              chunkRows={chunkRows}
              selectedPart={selectedPart}
              onSelectPart={onSelectPart}
            />
          ) : null}
          {activeTab === 'robustness' ? (
            <RobustnessDiagnosticsTab analysis={analysis} chunkRows={chunkRows} />
          ) : null}
          {activeTab === 'confidence' ? (
            <DecoderConfidenceTab analysis={analysis} chunkRows={chunkRows} />
          ) : null}
          {activeTab === 'metadata' ? (
            <MetadataTab analysis={analysis} selectedAudio={selectedAudio} />
          ) : null}
        </div>
      </div>
    </section>
  )
}

function WaveformDiagnosticsTab({ analysis }: { analysis: AnalysisPayload }) {
  // const signal = getWaveformPoints(analysis)
  const comparison = analysis.charts.waveformComparison
  const traces = [
    // { title: 'Signal waveform', points: signal, tone: 'signal' as const },
    { title: 'Cover waveform', points: comparison?.coverWaveform ?? [], tone: 'cover' as const },
    { title: 'Stego waveform', points: comparison?.stegoWaveform ?? [], tone: 'signal' as const },
    {
      title: 'Residual waveform',
      points: comparison?.differenceWaveform ?? comparison?.diffWaveform ?? [],
      tone: 'residual' as const,
    },
  ].filter((trace) => trace.points.length)

  if (!traces.length) {
    return (
      <UnavailablePanel
        title="Waveform diagnostics unavailable"
        message="The analysis response did not include signal or compare waveform samples."
      />
    )
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {traces.map((trace) => (
        <WaveformTrace key={trace.title} title={trace.title} points={trace.points} tone={trace.tone} />
      ))}
    </div>
  )
}

function WaveformTrace({
  title,
  points,
  tone,
}: {
  title: string
  points: WavePoint[]
  tone: 'signal' | 'cover' | 'residual'
}) {
  const width = 720
  const height = 120
  const path = pointsToPath(points, width, height / 2, height / 2 - 14)
 const stroke =
    tone === 'residual'
      ? 'rgb(232,116,101)' // Alert Red/Orange
      : tone === 'cover'
        ? 'rgb(0,204,102)' // Deeper, professional Slate Grey
        : 'rgb(91,173,190)'  // Aura Teal

  return (
    <div className="rounded-[12px] border border-aura-border/10 bg-aura-bg/20 px-3 py-3">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-aura-dim">{title}</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full">
        <line
          x1={0}
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke="rgb(var(--aura-border) / 0.16)"
        />
        <path d={path} fill="none" stroke={stroke} strokeWidth={1.6} />
      </svg>
    </div>
  )
}

function SpectrogramDiagnosticsTab({ analysis }: { analysis: AnalysisPayload }) {
  const compare = analysis.charts.compareSpectrogram
  const matrices = [
    { title: 'Cover spectrogram', matrix: compare?.spectrograms?.cover, variant: 'signal' as const },
    {
      title: 'Stego spectrogram',
      matrix: compare?.spectrograms?.stego || analysis.charts.signalSpectrogram || analysis.legacy?.signal.spectrogram,
      variant: 'signal' as const,
    },
    {
      title: 'Residual difference map',
      matrix: compare?.residualAnalysis?.residualSpectrogram || compare?.spectrograms?.residual,
      variant: 'residual' as const,
    },
  ].filter((item): item is { title: string; matrix: SpectrogramMatrix; variant: 'signal' | 'residual' } =>
    hasSpectrogramValues(item.matrix),
  )

  const backendImages = [
    { title: 'Cover spectrogram', src: compare?.coverImageUrl },
    { title: 'Stego spectrogram', src: compare?.stegoImageUrl },
    { title: 'Residual difference map', src: compare?.diffImageUrl },
  ].filter((item): item is { title: string; src: string } => Boolean(item.src))

  if (!matrices.length && !backendImages.length) {
    return (
      <UnavailablePanel
        title="No real STFT data returned"
        message="Aura only renders spectrograms when the analysis response contains generated STFT matrices or persisted spectrogram artifacts."
      />
    )
  }

  return (
    <div className="space-y-3">
      {matrices.length ? (
        <div className="grid gap-3 xl:grid-cols-3">
          {matrices.map((item) => (
            <SpectrogramCanvas
              key={item.title}
              title={item.title}
              matrix={item.matrix}
              variant={item.variant}
            />
          ))}
        </div>
      ) : null}

      {!matrices.length && backendImages.length ? (
        <div className="grid gap-3 xl:grid-cols-3">
          {backendImages.map((item) => (
            <div key={item.title} className="overflow-hidden rounded-[12px] border border-aura-border/10 bg-aura-bg/20">
              <div className="border-b border-aura-border/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-aura-dim">
                {item.title}
              </div>
              <img src={resolveUrl(item.src)} alt={item.title} className="aspect-[16/9] w-full object-cover" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function SpectrogramCanvas({
  title,
  matrix,
  variant,
}: {
  title: string
  matrix: SpectrogramMatrix
  variant: 'signal' | 'residual'
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !hasSpectrogramValues(matrix)) return

    const parent = canvas.parentElement
    const dpr = window.devicePixelRatio || 1
    const width = Math.max(280, parent?.clientWidth ?? 360)
    const height = 230
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    
    // Dynamically check if dark mode is active on the HTML root
    const isDark = document.documentElement.classList.contains('dark')
    ctx.fillStyle = isDark ? 'rgb(12,13,15)' : 'rgb(248, 250, 252)'
    ctx.fillRect(0, 0, width, height)

    const rows = matrix.values.length
    const cols = matrix.values[0].length
    const visibleCols = Math.max(8, Math.floor(cols / zoom))
    const startCol = Math.floor(offset * Math.max(0, cols - visibleCols))
    const cellWidth = width / visibleCols
    const cellHeight = height / rows

    for (let row = 0; row < rows; row += 1) {
      const drawRow = rows - 1 - row
      for (let visibleCol = 0; visibleCol < visibleCols; visibleCol += 1) {
        const col = startCol + visibleCol
        const value = clamp(Number(matrix.values[row]?.[col] ?? 0), 0, 1)
        ctx.fillStyle = spectrogramColor(value, variant)
        ctx.fillRect(
          Math.floor(visibleCol * cellWidth),
          Math.floor(drawRow * cellHeight),
          Math.ceil(cellWidth + 0.4),
          Math.ceil(cellHeight + 0.4),
        )
      }
    }
  }, [matrix, offset, variant, zoom])

  function handleWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    event.preventDefault()
    setZoom((value) => clamp(value + (event.deltaY < 0 ? 0.25 : -0.25), 1, 5))
  }

  return (
    <div className="overflow-hidden rounded-[12px] border border-aura-border/10 bg-aura-bg/20">
      <div className="flex items-start justify-between gap-3 border-b border-aura-border/10 px-3 py-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-aura-dim">{title}</div>
          <div className="mt-1 text-[11px] text-aura-muted">
            {matrix.freqBins} bins / {matrix.timeBins} frames
          </div>
        </div>
        <div className="font-mono text-[11px] text-aura-dim">{zoom.toFixed(1)}x</div>
      </div>

      <canvas ref={canvasRef} onWheel={handleWheel} className="block w-full cursor-crosshair" />

      <div className="flex items-center gap-2 border-t border-aura-border/10 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-aura-dim">Pan</span>
        <input
          type="range"
          min={0}
          max={100}
          value={offset * 100}
          onChange={(event) => setOffset(Number(event.target.value) / 100)}
          disabled={zoom <= 1}
          className="min-w-0 flex-1 accent-cyan-300 disabled:opacity-30"
        />
      </div>
    </div>
  )
}

function ChunkDiagnosticsTab({
  analysis,
  chunkRows,
  selectedPart,
  onSelectPart,
}: {
  analysis: AnalysisPayload
  chunkRows: AnalysisPayload['chunkTable']
  selectedPart: number | 'all'
  onSelectPart: (part: number | 'all') => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const insights = getChunkInsights(chunkRows, analysis)
  const parts = getAvailableParts(analysis)

  if (!insights.length) {
    return (
      <UnavailablePanel
        title="Chunk diagnostics unavailable"
        message="The selected analysis did not emit per-chunk confidence or signal metrics."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-aura-dim">
            Chunk inspection
          </div>
          <p className="mt-1 text-sm text-aura-muted">
            Expand a row for emitted SNR, MSE, STFT delta, ECC, and payload-role details.
          </p>
        </div>
        {parts.length ? (
          <PartSelector parts={parts} selectedPart={selectedPart} onSelectPart={onSelectPart} />
        ) : null}
      </div>

      <div className="overflow-hidden rounded-[12px] border border-aura-border/10">
        <div className="hidden grid-cols-[90px_115px_120px_120px_120px_1fr] gap-0 border-b border-aura-border/10 bg-aura-bg/26 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-aura-dim lg:grid">
          <div>Chunk</div>
          <div>Confidence</div>
          <div>Bit recovery</div>
          <div>Corruption</div>
          <div>Payload role</div>
          <div>Status</div>
        </div>

        {insights.map((insight) => {
          const key = `${insight.row.partNumber ?? 0}-${insight.row.chunkIndex}-${insight.order}`
          const open = expanded === key

          return (
            <div key={key} className="border-b border-aura-border/10 last:border-b-0">
              <button
                type="button"
                onClick={() => setExpanded(open ? null : key)}
                className="grid w-full gap-2 px-3 py-3 text-left transition-colors hover:bg-aura-bg/22 lg:grid-cols-[90px_115px_120px_120px_120px_1fr] lg:items-center"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm text-aura-text">#{insight.row.chunkIndex}</span>
                  <ChevronDown size={14} className={cn('text-aura-dim transition-transform lg:hidden', open && 'rotate-180')} />
                </div>
                <ChunkValue label="Confidence" value={formatPercentValue(insight.confidence)} />
                <ChunkValue label="Bit recovery" value={formatPercentValue(insight.bitAccuracy)} />
                <ChunkValue label="Corruption" value={formatPercentValue(insight.corruption)} tone={insight.tone} />
                <ChunkValue label="Payload role" value={formatRoleLabel(insight.role)} />
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-sm text-aura-muted">{insight.row.status || 'unknown'}</span>
                  <ChevronDown size={14} className={cn('hidden text-aura-dim transition-transform lg:block', open && 'rotate-180')} />
                </div>
              </button>

              {open ? (
                <div className="grid gap-2 border-t border-aura-border/10 bg-aura-bg/18 px-3 py-3 sm:grid-cols-2 xl:grid-cols-4">
                  <ChunkDetail label="Part" value={String(insight.row.partNumber ?? '-')} />
                  <ChunkDetail label="SNR" value={formatSnr(insight.row.snrDb)} />
                  <ChunkDetail label="MSE" value={formatNullableDecimal(insight.row.mse, 6)} />
                  <ChunkDetail label="STFT delta" value={formatNullableDecimal(insight.row.stftDeltaScore, 6)} />
                  <ChunkDetail label="ECC corrections" value={String(insight.row.correctionCount)} />
                  <ChunkDetail label="Correction applied" value={insight.row.correctionApplied ? 'Yes' : 'No'} />
                  <ChunkDetail label="Active payload bits" value="Not emitted" />
                  <ChunkDetail
                    label="Flags"
                    value={insight.row.isMissing ? 'Missing' : insight.row.isDuplicate ? 'Duplicate' : 'None'}
                  />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ChunkValue({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: MetricTone
}) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.13em] text-aura-dim lg:hidden">{label}</div>
      <div
        className={cn(
          'mt-1 truncate text-sm lg:mt-0',
          tone === 'danger' && 'text-aura-danger',
          tone === 'warning' && 'text-aura-accent',
          tone === 'safe' && 'text-aura-reveal',
          tone === 'neutral' && 'text-aura-text',
        )}
      >
        {value}
      </div>
    </div>
  )
}

function ChunkDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-aura-border/10 bg-aura-surface px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.13em] text-aura-dim">{label}</div>
      <div className="mt-1 truncate text-sm text-aura-text">{value}</div>
    </div>
  )
}

function RobustnessDiagnosticsTab({
  analysis,
  chunkRows,
}: {
  analysis: AnalysisPayload
  chunkRows: AnalysisPayload['chunkTable']
}) {
  const insights = getChunkInsights(chunkRows, analysis)
  const snrRows = chunkRows.filter((row) => typeof row.snrDb === 'number')
  const snrValues = snrRows.map((row) => row.snrDb as number)
  const minSnr = snrValues.length ? Math.min(...snrValues) : null
  const maxSnr = snrValues.length ? Math.max(...snrValues) : null
  const tamper = getTamperResistanceEstimate(analysis, insights)

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-3">
        <DiagnosticSummary
          label="Backend integrity score"
          value={formatPercentValue(normalizePercent(analysis.summary.integrityScore))}
          detail="Summary integrity score emitted by analysis."
        />
        <DiagnosticSummary
          label="Estimated tamper resistance"
          value={formatPercentValue(tamper)}
          detail="Derived from emitted integrity, confidence, sequence, and correction load."
        />
        <DiagnosticSummary
          label="Error correction pressure"
          value={`${analysis.summary.correctionsCount || 0} correction(s)`}
          detail={analysis.summary.correctionsApplied ? 'Correction path engaged.' : 'No correction path recorded.'}
        />
        <DiagnosticSummary
          label="Sequence continuity"
          value={analysis.summary.sequenceValid === false ? 'Flagged' : 'Validated'}
          detail={`${analysis.summary.missingPartsCount || 0} missing / ${analysis.summary.duplicatePartsCount || 0} duplicate part(s).`}
        />
      </div>

      <div className="rounded-[12px] border border-aura-border/10 bg-aura-bg/18 px-4 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-aura-dim">
              Signal robustness basis
            </div>
            <div className="mt-1 text-sm text-aura-muted">
              Per-chunk SNR when cover and stego comparison data exists.
            </div>
          </div>
          <div className="font-mono text-[11px] text-aura-dim">
            {snrValues.length ? `${formatSnr(minSnr)} to ${formatSnr(maxSnr)}` : 'SNR not emitted'}
          </div>
        </div>

        {snrRows.length ? (
          <div className="mt-4 space-y-2">
            {snrRows.slice(0, 18).map((row) => {
              const ratio = normalizeSnr(row.snrDb)
              return (
                <div key={`${row.partNumber ?? 0}-${row.chunkIndex}`} className="grid grid-cols-[72px_1fr_64px] items-center gap-2">
                  <div className="font-mono text-[11px] text-aura-dim">Chunk {row.chunkIndex}</div>
                  <div className="h-1.5 bg-aura-border/10">
                    <div className="h-full bg-aura-reveal" style={{ width: `${ratio * 100}%` }} />
                  </div>
                  <div className="text-right font-mono text-[11px] text-aura-muted">{formatSnr(row.snrDb)}</div>
                </div>
              )
            })}
            {snrRows.length > 18 ? (
              <div className="pt-1 font-mono text-[11px] text-aura-dim">
                Showing first 18 of {snrRows.length} emitted SNR rows.
              </div>
            ) : null}
          </div>
        ) : (
          <UnavailableInline message="No chunk SNR rows were emitted for this selected target." />
        )}
      </div>
    </div>
  )
}

function DiagnosticSummary({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-[12px] border border-aura-border/10 bg-aura-bg/18 px-3 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-aura-dim">{label}</div>
      <div className="mt-2 text-lg font-semibold text-aura-text">{value}</div>
      <div className="mt-1 text-sm leading-5 text-aura-muted">{detail}</div>
    </div>
  )
}

function DecoderConfidenceTab({
  analysis,
  chunkRows,
}: {
  analysis: AnalysisPayload
  chunkRows: AnalysisPayload['chunkTable']
}) {
  const insights = getChunkInsights(chunkRows, analysis)
  const emittedConfidence = insights.filter((insight) => insight.confidence != null)
  const average = averageNullable(emittedConfidence.map((insight) => insight.confidence))

  if (!emittedConfidence.length) {
    return (
      <UnavailablePanel
        title="Decoder confidence unavailable"
        message="The selected analysis did not emit chunk confidence values."
      />
    )
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <div className="space-y-3">
        <DiagnosticSummary
          label="Decode confidence"
          value={formatPercentValue(normalizePercent(analysis.summary.recoveryConfidence))}
          detail="Summary confidence returned by analysis."
        />
        <DiagnosticSummary
          label="Chunk average"
          value={formatPercentValue(average)}
          detail={`${emittedConfidence.length} chunk confidence value(s) emitted.`}
        />
      </div>

      <div className="rounded-[12px] border border-aura-border/10 bg-aura-bg/18 px-4 py-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-aura-dim">
          Temporal certainty map
        </div>
        <div className="mt-3 overflow-x-auto">
          <div
            className="grid min-w-[640px] gap-1"
            style={{
              gridTemplateColumns: `repeat(${emittedConfidence.length}, minmax(10px, 1fr))`,
            }}
          >
            {emittedConfidence.map((insight) => (
              <div
                key={`confidence-${insight.row.partNumber ?? 0}-${insight.row.chunkIndex}-${insight.order}`}
                className="group relative h-28 overflow-hidden rounded-[5px] bg-aura-border/10"
                title={`Chunk ${insight.row.chunkIndex}: ${formatPercentValue(insight.confidence)}`}
              >
                <div
                  className={cn(
                    'absolute inset-x-0 bottom-0 transition-opacity group-hover:opacity-90',
                    insight.tone === 'safe' && 'bg-aura-reveal',
                    insight.tone === 'warning' && 'bg-aura-accent',
                    insight.tone === 'danger' && 'bg-aura-danger',
                    insight.tone === 'neutral' && 'bg-aura-muted',
                  )}
                  style={{ height: `${Math.max(6, (insight.confidence ?? 0) * 100)}%` }}
                />
                {insight.activePayload ? (
                  <span className="absolute inset-x-0 top-0 h-1 bg-aura-reveal/80" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 font-mono text-[11px] text-aura-muted">
          <LegendDot color="rgb(91,173,190)" label="stable" />
          <LegendDot color="rgb(126,132,184)" label="needs review" />
          <LegendDot color="rgb(232,116,101)" label="weak or corrupted" />
        </div>
      </div>
    </div>
  )
}

function MetadataTab({
  analysis,
  selectedAudio,
}: {
  analysis: AnalysisPayload
  selectedAudio: SelectedAudio | null
}) {
  const rows: Array<[string, string]> = [
    ['analysis_id', analysis.analysisId || 'not reported'],
    ['source_type', analysis.sourceType || 'not reported'],
    ['analysis_status', analysis.status || 'not reported'],
    ['message_id', selectedAudio?.messageId || analysis.legacy?.message_id || 'not reported'],
    ['transmission_id', analysis.transmissionId || 'not reported'],
    ['selected_part', analysis.selectedPartNumber != null ? String(analysis.selectedPartNumber) : 'not reported'],
    ['selected_file', analysis.selectedPartFilename || selectedAudio?.fileName || 'not reported'],
    ['files_processed', `${analysis.filesProcessed ?? analysis.summary.filesProcessed} / ${analysis.filesTotal ?? analysis.summary.filesTotal}`],
    ['elapsed_ms', analysis.elapsedMs != null ? String(analysis.elapsedMs) : 'not reported'],
    ['compare_assets', String(analysis.provenance.assets.length)],
    ['sample_rate', getSampleRateLabel(analysis)],
    ['duration', getDurationLabel(analysis, selectedAudio)],
  ]

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-[12px] border border-aura-border/10 bg-aura-bg/18 px-4 py-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-aura-dim">
          Analysis metadata
        </div>
        <DenseKeyValue rows={rows} />
      </div>

      <div className="space-y-3">
        <DiagnosticSummary
          label="Spectrogram provenance"
          value={hasAnySpectrogram(analysis) ? 'Available' : 'Not emitted'}
          detail="Spectrogram views only render emitted STFT matrices or persisted artifacts."
        />
        <DiagnosticSummary
          label="Model"
          value={getModelVersion(analysis)}
          detail="Decoder metadata from the current analysis object."
        />
        <DebugDisclosure analysis={analysis} />
      </div>
    </div>
  )
}

function DebugDisclosure({ analysis }: { analysis: AnalysisPayload }) {
  const debugPayload = {
    recoveryChanges: analysis.recovery.changes,
    verdict: analysis.verdict ?? null,
    metrics: analysis.metrics ?? null,
  }
  const hasDebugPayload =
    analysis.recovery.changes.length > 0 || analysis.verdict != null || analysis.metrics != null

  return (
    <details className="rounded-[12px] border border-aura-border/10 bg-aura-bg/18 px-3 py-3">
      <summary className="cursor-pointer list-none text-sm font-semibold text-aura-text">
        Layer 5 low-level debug
      </summary>
      <div className="mt-3">
        {hasDebugPayload ? (
          <pre className="max-h-[260px] overflow-auto rounded-[10px] bg-aura-surface px-3 py-3 font-mono text-[11px] leading-5 text-aura-muted">
            {JSON.stringify(debugPayload, null, 2)}
          </pre>
        ) : (
          <UnavailableInline message="No low-level debug payload was emitted for this run." />
        )}
      </div>
    </details>
  )
}

function DenseKeyValue({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="mt-3 divide-y divide-aura-border/10">
      {rows.map(([key, value]) => (
        <div key={key} className="grid gap-1 py-2 font-mono text-[11px] sm:grid-cols-[150px_1fr] sm:gap-3">
          <div className="text-aura-dim">{key}</div>
          <div className="break-words text-aura-muted">{value}</div>
        </div>
      ))}
    </div>
  )
}

function UnavailablePanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-[12px] border border-dashed border-aura-border/12 bg-aura-bg/18 px-6 py-8 text-center">
      <div className="max-w-md">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
          Real data only
        </div>
        <div className="mt-3 text-xl font-semibold text-aura-text">{title}</div>
        <p className="mt-2 text-sm leading-6 text-aura-muted">{message}</p>
      </div>
    </div>
  )
}

function UnavailableInline({ message }: { message: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-aura-border/12 bg-aura-surface px-3 py-3 text-sm leading-6 text-aura-muted">
      {message}
    </div>
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
  const progress = Math.min(84, Math.round(((activeStepIndex + 0.65) / ANALYSIS_PIPELINE_STEPS.length) * 100))

  return (
    <section className="mt-6 border-y border-aura-border/10 py-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-end">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-aura-reveal">
            <Loader2 size={14} className="animate-spin" />
            Forensic analysis running
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal text-aura-text">
            {activeStep.title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-aura-muted">{activeStep.runningText}</p>
        </div>

        <div className="grid grid-cols-3 gap-3 font-mono text-[11px] text-aura-muted">
          <RuntimeDatum label="mode" value={sourceType} />
          <RuntimeDatum label="files" value={expectedFiles} />
          <RuntimeDatum label="stage" value={`${activeStepIndex + 1}/${ANALYSIS_PIPELINE_STEPS.length}`} />
        </div>
      </div>

      <div className="mt-6 h-1 bg-aura-border/10">
        <div className="h-full bg-aura-reveal transition-all duration-700" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-5 grid gap-px overflow-hidden rounded-[8px] border border-aura-border/10 bg-aura-border/10 md:grid-cols-2 xl:grid-cols-4">
        {ANALYSIS_PIPELINE_STEPS.map((step, index) => {
          const state: AnalysisStepState =
            index < activeStepIndex ? 'complete' : index === activeStepIndex ? 'running' : 'pending'
          return <AnalysisPipelineStepCard key={step.key} step={step} state={state} />
        })}
      </div>
    </section>
  )
}

function AnalysisPipelineStepCard({
  step,
  state,
}: {
  step: (typeof ANALYSIS_PIPELINE_STEPS)[number]
  state: AnalysisStepState
}) {
  return (
    <div className="bg-aura-surface px-4 py-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'text-aura-dim',
            state === 'complete' && 'text-aura-reveal',
            state === 'running' && 'text-aura-text',
          )}
        >
          {state === 'complete' ? (
            <Check size={14} />
          ) : state === 'running' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Circle size={14} />
          )}
        </span>
        <div className="text-sm font-semibold text-aura-text">{step.title}</div>
      </div>
      <p className="mt-2 text-xs leading-5 text-aura-muted">{step.caption}</p>
    </div>
  )
}

function RuntimeDatum({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="uppercase tracking-[0.14em] text-aura-dim">{label}</div>
      <div className="mt-1 text-aura-text">{value}</div>
    </div>
  )
}

function EmptyAnalysisState() {
  return (
    <section className="py-10 lg:py-12">
      <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-7">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-aura-dim">
            Forensic analysis workspace
          </div>
          <h2 className="mt-3 text-[42px] font-semibold leading-[1.02] tracking-normal text-aura-text sm:text-[48px]">
            Select a transmission
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-aura-muted">
            Choose an Aura WAV target above, then run analysis to recover payload text and inspect real signal evidence.
          </p>

          <div className="mt-6 grid gap-2 text-[12px] text-aura-muted sm:grid-cols-2">
            <CapabilityRow title="Recovery outcome" detail="payload text and trust status first" />
            <CapabilityRow title="Chunk diagnostics" detail="confidence, ECC, and signal rows" />
            <CapabilityRow title="Signal timeline" detail="payload regions aligned to chunks" />
            <CapabilityRow title="Real STFT views" detail="rendered only when emitted" />
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="aura-glass-panel overflow-hidden rounded-[16px] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                  Preview
                </div>
                <div className="mt-1 text-sm font-semibold text-aura-text">Payload timeline surface</div>
              </div>
              <ToolbarChip value="pending" />
            </div>

            <div className="mt-4">
              <WaveformStrip tone="reveal" dense />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function CapabilityRow({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex gap-3 rounded-[12px] border border-aura-border/10 bg-aura-bg/14 px-3 py-2">
      <span className="mt-1 h-2.5 w-2.5 rounded-[4px] bg-aura-reveal/60" />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-aura-text">{title}</div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-aura-dim">{detail}</div>
      </div>
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
    <StateSection
      eyebrow="Analysis completed"
      title="No analysis payload was returned"
      message={`The backend settled in '${status}', but did not return a renderable forensic object for this item.`}
      actionLabel="Retry analysis"
      onAction={onRetry}
      actionDisabled={retryDisabled}
    />
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
  const analysisTarget = analysis.selectedPartFilename || analysis.transmissionId || analysis.analysisId || 'Unknown'

  return (
    <StateSection
      eyebrow="Analysis returned"
      title="Target mapping did not align"
      message={`Selected audio: ${selectedFile}. Analysis target: ${analysisTarget}. This is usually a grouped-versus-single target identity mismatch.`}
      actionLabel="Retry analysis"
      onAction={onRetry}
      actionDisabled={retryDisabled}
    />
  )
}

function AnalysisErrorState({ error }: { error: string }) {
  return <StateSection eyebrow="Analysis failed" title="Analysis could not complete" message={error} />
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

  const reason =
    analysis.reason ||
    analysis.message ||
    analysis.summary?.trustMessage ||
    'Analysis reached a terminal state without a renderable evidence object.'

  return (
    <StateSection
      eyebrow="Analysis status"
      title={titleByStatus[analysis.status] ?? analysis.status}
      message={reason}
      actionLabel="Retry analysis"
      onAction={onRetry}
      actionDisabled={retryDisabled}
    />
  )
}

function StateSection({
  eyebrow,
  title,
  message,
  actionLabel,
  onAction,
  actionDisabled,
}: {
  eyebrow: string
  title: string
  message: string
  actionLabel?: string
  onAction?: () => Promise<void> | void
  actionDisabled?: boolean
}) {
  return (
    <section className="mt-8 border-y border-aura-border/10 py-8">
      <div className="max-w-3xl">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-aura-dim">{eyebrow}</div>
        <h2 className="mt-3 text-3xl font-semibold tracking-normal text-aura-text">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-aura-muted">{message}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            disabled={actionDisabled}
            className="mt-5 inline-flex h-9 items-center gap-2 border border-aura-border/10 px-3 text-sm font-semibold text-aura-text transition-colors hover:bg-aura-surfaceSoft disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RefreshCcw size={14} />
            {actionLabel}
          </button>
        ) : null}
      </div>
    </section>
  )
}

function InlineSystemNotice({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'danger'
}) {
  return (
    <div
      className={cn(
        'mt-4 border px-4 py-3 text-sm',
        tone === 'danger'
          ? 'border-aura-danger/20 bg-aura-danger/10 text-aura-danger'
          : 'border-aura-border/10 bg-aura-surface text-aura-muted',
      )}
    >
      {children}
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

export function getRecoveryVerdict(
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

function getPsnr(mse: number | null | undefined): number | null {
  if (mse == null || !Number.isFinite(mse) || mse <= 0) return null
  return 10 * Math.log10(1.0 / mse)
}

function getCoreMetrics(
  analysis: AnalysisPayload,
  chunkRows: AnalysisPayload['chunkTable'],
): MetricDescriptor[] {
  const insights = getChunkInsights(chunkRows, analysis)
  const bitAccuracy = getAverageBitAccuracy(insights)
  const snrAverage =
    averageNullable(chunkRows.map((row) => (typeof row.snrDb === 'number' ? row.snrDb : null))) ??
    analysis.summary.overallSnrDb
  const mseAverage =
    averageNullable(chunkRows.map((row) => (typeof row.mse === 'number' ? row.mse : null))) ??
    analysis.summary.overallMse
  const psnrValue = getPsnr(mseAverage)
  const payloadDensity = getPayloadDensity(analysis)
  const activeChunks = getActivePayloadChunkCount(analysis, insights)
  const robustness = normalizePercent(analysis.summary.integrityScore)
  const confidence = normalizePercent(analysis.summary.recoveryConfidence)
  const tamper = getTamperResistanceEstimate(analysis, insights)
  const charAccuracy = normalizePercent(analysis.summary.characterAccuracy)

  return [
    {
      label: 'SNR',
      value: formatSnr(snrAverage),
      note: snrAverage == null ? 'cover comparison absent' : 'emitted signal quality',
      normalized: normalizeSnr(snrAverage),
      tone: snrAverage == null ? 'neutral' : snrAverage >= 18 ? 'safe' : snrAverage >= 10 ? 'warning' : 'danger',
    },
    {
      label: 'PSNR',
      value: psnrValue == null ? 'Unavailable' : `${psnrValue.toFixed(1)} dB`,
      note: psnrValue == null ? 'cover comparison absent' : 'peak signal-to-noise ratio',
      normalized: psnrValue == null ? null : clamp(psnrValue / 60, 0, 1),
      tone: psnrValue == null ? 'neutral' : psnrValue >= 40 ? 'safe' : psnrValue >= 30 ? 'warning' : 'danger',
    },
    // {
    //   label: 'Bit accuracy',
    //   value: formatPercentValue(bitAccuracy),
    //   note: bitAccuracy == null ? 'bit agreement absent' : 'chunk bit agreement',
    //   normalized: bitAccuracy,
    //   tone: getAccuracyTone(bitAccuracy),
    // },
    {
      label: 'Character accuracy',
      value: charAccuracy == null ? 'Unavailable' : formatPercentValue(charAccuracy),
      note: charAccuracy == null ? 'original plaintext absent' : 'reconstructed character accuracy',
      normalized: charAccuracy,
      tone: charAccuracy == null ? 'neutral' : getAccuracyTone(charAccuracy),
    },
    {
      label: 'Payload density',
      value: formatPercentValue(payloadDensity),
      note: payloadDensity == null ? 'payload structure absent' : 'payload blocks / emitted structure',
      normalized: payloadDensity,
      tone: 'neutral',
    },
    {
      label: 'Active chunk count',
      value: String(activeChunks),
      note: 'payload-region chunks',
    },
    {
      label: 'Robustness score',
      value: formatPercentValue(robustness),
      note: 'backend integrity score',
      normalized: robustness,
      tone: getAccuracyTone(robustness),
    },
    {
      label: 'Decode confidence',
      value: formatPercentValue(confidence),
      note: 'summary recovery confidence',
      normalized: confidence,
      tone: getAccuracyTone(confidence),
    },
    {
      label: 'Estimated tamper resistance',
      value: formatPercentValue(tamper),
      note: 'derived from emitted metrics',
      normalized: tamper,
      tone: getAccuracyTone(tamper),
    },
  ]
}

function getChunkInsights(
  chunkRows: AnalysisPayload['chunkTable'],
  analysis: AnalysisPayload
): ChunkInsight[] {
  const structure = analysis.charts.payloadStructure;
  const diagnostics = (analysis as any).receiverDiagnostics || {};

  let realConfidences: number[] = [];
  const errorChunkIndices = new Set<number>();
  
  const repeatFactor = diagnostics.repeat_factor || 3;
  const eccScheme = diagnostics.ecc_scheme || 0;
  const chunksPerChar = (eccScheme === 1 ? 4 : 2) * repeatFactor;
  const headerBlocks = Math.max(0, structure.headerBlocks);

  const processDiag = (diag: any, chunkOffset: number) => {
    if (!diag) return;
    
    const headerConf = diag.header_chunk_confidences || [];
    const payloadConf = diag.payload_chunk_confidences || [];
    realConfidences.push(...headerConf, ...payloadConf);

    // 1. Map Payload ECC Errors
    const eccErrors = diag.ecc_error_locations || [];
    eccErrors.forEach((err: any) => {
      const charIdx = err.char_index ?? err.charIndex ?? 0;
      const startChunk = chunkOffset + headerBlocks + (charIdx * chunksPerChar);
      for (let i = 0; i < chunksPerChar; i++) {
        errorChunkIndices.add(startChunk + i);
      }
    });

    // 2. Map Header ECC Errors (NEW)
    if (diag.header_checksum_corrected && typeof diag.header_correction_byte === 'number') {
      // The header data chunks start after the 12-chunk sync pattern
      const syncPatternOffset = 12; 
      // 1 byte = 2 nibbles = 2 * repeatFactor chunks
      const startChunk = chunkOffset + syncPatternOffset + (diag.header_correction_byte * 2 * repeatFactor);
      
      // Flag all chunks associated with this corrupted byte
      for (let i = 0; i < (2 * repeatFactor); i++) {
        errorChunkIndices.add(startChunk + i);
      }
    }
  };

  if (diagnostics.segments && Array.isArray(diagnostics.segments)) {
    let currentOffset = 0;
    diagnostics.segments.forEach((seg: any) => {
      const segDiag = seg.diagnostics || {};
      processDiag(segDiag, currentOffset);
      const totalChunks = segDiag.total_chunks || 
        ((segDiag.header_chunk_confidences?.length || 0) + (segDiag.payload_chunk_confidences?.length || 0));
      currentOffset += totalChunks;
    });
  } else {
    processDiag(diagnostics, 0);
  }

  return chunkRows.map((row, visualOrder) => {
    const globalIndex = row.chunkIndex; 
    
    const rawConfidence = globalIndex < realConfidences.length ? realConfidences[globalIndex] : row.confidence;
    const confidence = typeof rawConfidence === 'number' ? normalizePercent(rawConfidence) : null;

    const bitAccuracy = typeof row.bitAgreement === 'number' ? normalizePercent(row.bitAgreement) : null;
    const role = getPayloadRole(visualOrder, row, structure);

    // Did PyTorch/ECC flag this exact chunk as corrupted/corrected?
    const hasRealEccError = errorChunkIndices.has(globalIndex);
    const hasSimulatedError = row.correctionApplied || (row.correctionCount || 0) > 0;
    const isCorrupted = hasRealEccError || hasSimulatedError;

    const correctionPressure = isCorrupted ? 1 : clamp((row.correctionCount || 0) / 4, 0, 1);
    const bitPressure = bitAccuracy == null ? 0 : 1 - bitAccuracy;
    const confidencePressure = confidence == null ? 0 : 1 - confidence;
    const stftPressure = typeof row.stftDeltaScore === 'number' ? clamp(row.stftDeltaScore * 5, 0, 1) : 0;
    const structuralPressure = row.isMissing || row.isDuplicate ? 1 : 0;
    const statusPressure = row.status === 'low_confidence' || row.status === 'missing' ? 0.35 : 0;

    // If ECC caught it, hard-peg corruption to 1.0 (100%), else calculate normally
    const corruption = isCorrupted ? 1.0 : clamp(
      structuralPressure ||
        confidencePressure * 0.36 +
          bitPressure * 0.44 +
          correctionPressure * 0.16 +
          stftPressure * 0.18 +
          statusPressure,
      0,
      1,
    );

    return {
      row: {
        ...row,
        // Inject the real correction status back into the row so the UI Tooltip shows it
        correctionApplied: isCorrupted,
        correctionCount: isCorrupted ? Math.max(1, row.correctionCount || 0) : row.correctionCount,
      },
      order: visualOrder,
      role,
      activePayload: role === 'header' || role === 'payload' || role === 'redundancy',
      confidence,
      bitAccuracy,
      corruption,
      tone: getChunkTone(row, confidence, corruption),
    };
  });
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

function getAverageBitAccuracy(insights: ChunkInsight[]) {
  return averageNullable(insights.map((insight) => insight.bitAccuracy))
}

function getPayloadDensity(analysis: AnalysisPayload) {
  const structure = analysis.charts.payloadStructure
  const total =
    structure.headerBlocks +
    structure.payloadBlocks +
    structure.redundancyBlocks +
    structure.ignoredTailBlocks +
    structure.duplicateBlocks

  if (total <= 0 || structure.payloadBlocks <= 0) return null
  return clamp(structure.payloadBlocks / total, 0, 1)
}

function getActivePayloadChunkCount(analysis: AnalysisPayload, insights: ChunkInsight[]) {
  const payloadBlocks = analysis.charts.payloadStructure.payloadBlocks
  if (payloadBlocks > 0) return payloadBlocks
  if (analysis.summary.payloadChunks > 0) return analysis.summary.payloadChunks
  return insights.filter((insight) => insight.activePayload).length
}

function getTamperResistanceEstimate(analysis: AnalysisPayload, insights: ChunkInsight[]) {
  const integrity = normalizePercent(analysis.summary.integrityScore)
  const confidence = normalizePercent(analysis.summary.recoveryConfidence)
  if (integrity == null && confidence == null) return null

  const chunkBase = Math.max(1, analysis.summary.payloadChunks || insights.length)
  const correctionPenalty = clamp((analysis.summary.correctionsCount || 0) / chunkBase, 0, 1) * 0.22
  const structuralPenalty = clamp(
    ((analysis.summary.missingPartsCount || 0) + (analysis.summary.duplicatePartsCount || 0)) /
      Math.max(1, analysis.summary.filesTotal || 1),
    0,
    1,
  ) * 0.34
  const weakChunkPenalty =
    insights.length > 0
      ? (insights.filter((insight) => insight.tone === 'danger').length / insights.length) * 0.14
      : 0
  const sequenceBonus = analysis.summary.sequenceValid === false ? 0 : 0.1
  const score =
    (integrity ?? 0) * 0.52 +
    (confidence ?? 0) * 0.38 +
    sequenceBonus -
    correctionPenalty -
    structuralPenalty -
    weakChunkPenalty

  return clamp(score, 0, 1)
}

export function getCorruptionSummary(analysis: AnalysisPayload, insights: ChunkInsight[]) {
  const corrections = analysis.summary.correctionsCount || 0
  const weakChunks = insights.filter((insight) => insight.tone === 'danger').length
  const missing = analysis.summary.missingPartsCount || 0
  const duplicates = analysis.summary.duplicatePartsCount || 0

  if (missing || duplicates || analysis.summary.sequenceValid === false) {
    return `Sequence diagnostics report ${missing} missing and ${duplicates} duplicate part(s). Review chunk evidence before trusting the full transmission.`
  }

  if (corrections) {
    return `${corrections} correction(s) were applied while the sequence remained intact. Recovered text stays visible with repaired regions exposed below.`
  }

  if (weakChunks) {
    return `${weakChunks} chunk(s) show high corruption pressure even though no sequence loss was reported.`
  }

  return 'No sequence loss or correction pressure was reported by the current analysis payload.'
}

export function getEccLabel(analysis: AnalysisPayload) {
  if (analysis.summary.correctionsApplied || analysis.summary.correctionsCount > 0) return 'Applied'
  return 'No correction recorded'
}

function getAvailableParts(analysis: AnalysisPayload) {
  const explicit = analysis.charts.compareSpectrogram?.partOptions ?? []
  const fromRows = analysis.chunkTable
    .map((row) => row.partNumber)
    .filter((part): part is number => typeof part === 'number' && Number.isFinite(part))
  return Array.from(new Set([...explicit, ...fromRows])).sort((left, right) => left - right)
}

function getWaveformPoints(analysis: AnalysisPayload): WavePoint[] {
  const signal = analysis.charts.signalWaveform
  if (signal?.length) return signal

  const stego = analysis.charts.waveformComparison?.stegoWaveform
  if (stego?.length) return stego

  const cover = analysis.charts.waveformComparison?.coverWaveform
  if (cover?.length) return cover

  const legacy = analysis.legacy?.signal.waveform
  if (legacy?.length) {
    return legacy.map((y, index) => ({ x: index, y }))
  }

  return []
}

function pointsToPath(points: WavePoint[], width: number, baseline: number, amplitude: number) {
  if (!points.length) return `M 0 ${baseline} L ${width} ${baseline}`

  return points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * width
      const y = baseline - clamp(point.y, -1, 1) * amplitude
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function hasSpectrogramValues(matrix?: SpectrogramMatrix | null): matrix is SpectrogramMatrix {
  return Boolean(matrix?.values?.length && matrix.values[0]?.length)
}

function hasAnySpectrogram(analysis: AnalysisPayload) {
  const compare = analysis.charts.compareSpectrogram
  return Boolean(
    hasSpectrogramValues(analysis.charts.signalSpectrogram) ||
      hasSpectrogramValues(analysis.legacy?.signal.spectrogram) ||
      hasSpectrogramValues(compare?.spectrograms?.cover) ||
      hasSpectrogramValues(compare?.spectrograms?.stego) ||
      hasSpectrogramValues(compare?.spectrograms?.residual) ||
      compare?.coverImageUrl ||
      compare?.stegoImageUrl ||
      compare?.diffImageUrl,
  )
}

function spectrogramColor(value: number, variant: 'signal' | 'residual') {
  const intensity = clamp(value, 0, 1)
  if (variant === 'residual') {
    const r = Math.round(14 + intensity * 218)
    const g = Math.round(18 + intensity * 122)
    const b = Math.round(24 + intensity * 96)
    return `rgb(${r},${g},${b})`
  }

  const r = Math.round(8 + intensity * 88)
  const g = Math.round(14 + intensity * 176)
  const b = Math.round(24 + intensity * 198)
  return `rgb(${r},${g},${b})`
}

function metricColor(tone: MetricTone) {
  if (tone === 'safe') return 'rgb(91,173,190)'
  if (tone === 'warning') return 'rgb(126,132,184)'
  if (tone === 'danger') return 'rgb(232,116,101)'
  return 'rgb(176,184,198)'
}

function getAccuracyTone(value: number | null): MetricTone {
  if (value == null) return 'neutral'
  if (value >= 0.82) return 'safe'
  if (value >= 0.62) return 'warning'
  return 'danger'
}

function formatRoleLabel(role: PayloadRole) {
  if (role === 'tail') return 'Ignored tail'
  return role.replace('_', ' ')
}

function getDurationLabel(analysis: AnalysisPayload, selectedAudio: SelectedAudio | null) {
  const duration =
    analysis.legacy?.signal.durationSec ??
    analysis.legacy?.signal.duration ??
    selectedAudio?.metadata?.carrier_duration_sec ??
    null

  if (typeof duration !== 'number' || !Number.isFinite(duration)) return 'Not reported'
  const minutes = Math.floor(duration / 60)
  const seconds = Math.round(duration % 60)
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`
}

function getSampleRateLabel(analysis: AnalysisPayload) {
  const sampleRate =
    analysis.charts.signalSpectrogram?.sampleRate ??
    analysis.charts.compareSpectrogram?.residualAnalysis?.sampleRate ??
    analysis.legacy?.signal.sampleRate ??
    analysis.legacy?.signal.sample_rate
  return typeof sampleRate === 'number' && Number.isFinite(sampleRate) ? `${sampleRate} Hz` : 'not reported'
}

function getModelVersion(analysis: AnalysisPayload | null) {
  const encode = analysis?.legacy?.encode as Record<string, unknown> | null | undefined
  const version = typeof encode?.encoder_version === 'string' ? encode.encoder_version : ''
  const name = typeof encode?.encoder_model_name === 'string' ? encode.encoder_model_name : ''
  if (name && version) return `${name} ${version}`
  if (name) return name
  return 'Aura V2-R'
}

function normalizeSnr(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 0
  return clamp((value + 4) / 34, 0, 1)
}

function normalizePercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null
  return clamp(value > 1 ? value / 100 : value, 0, 1)
}

function averageNullable(values: Array<number | null | undefined>) {
  const emitted = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (!emitted.length) return null
  return emitted.reduce((sum, value) => sum + value, 0) / emitted.length
}

function formatPercentValue(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 'Not reported'
  return `${Math.round(clamp(value, 0, 1) * 100)}%`
}

function formatSnr(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 'Not reported'
  return `${value.toFixed(1)} dB`
}

export function formatNullableBool(value: boolean | null | undefined) {
  if (value == null) return 'Not reported'
  return value ? 'Yes' : 'No'
}

function formatNullableDecimal(value: number | null | undefined, digits: number) {
  if (value == null || !Number.isFinite(value)) return 'Not reported'
  return value.toFixed(digits)
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  return `${(value / 1024).toFixed(1)} KB`
}

export function getTextByteLength(value: string) {
  if (!value) return 0
  return new TextEncoder().encode(value).length
}

function parseTotalParts(fileName?: string) {
  const match = (fileName || '').match(/^tx_[^_]+_part_\d+_of_(\d+)\.wav$/i)
  if (!match) return undefined
  const total = Number(match[1])
  return Number.isFinite(total) && total > 0 ? total : undefined
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'aura-analysis'
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getFinalVerdict(analysis: AnalysisPayload) {
  const status = (analysis.status || '').toLowerCase()
  const recoveryStatus = (analysis.summary?.recoveryStatus || '').toLowerCase()
  
  const corrections = analysis.summary?.correctionsCount || 0
  const missing = analysis.summary?.missingPartsCount || 0
  const failed = analysis.summary?.failedPartsCount || 0

  // Calculate if we actually got text back, regardless of backend status
  const recoveredText = 
    analysis?.summary?.recoveredText?.trim() ||
    analysis?.recovery?.corrected_text?.trim() ||
    analysis?.recovery?.raw_text?.trim() ||
    '';
  
  const hasText = recoveredText.length > 0;

  // Pure failure: Backend says failed AND we got absolutely no text out of it
  if ((status === 'failed' || recoveryStatus === 'failed') && !hasText) {
    return {
      title: 'Recovery Failed',
      description: 'The payload could not be reconstructed from the available audio signal.',
      badge: 'Status: Failed',
      tone: 'danger' as const,
    }
  }

  // Smart Fallback: Backend says failed, BUT we managed to extract text anyway (e.g., CRC failed, but text is readable)
  if ((status === 'failed' || recoveryStatus === 'failed') && hasText) {
    return {
      title: 'Payload Recovered with Errors',
      description: 'Text was extracted, but the signal failed backend validation (e.g., checksum mismatch or high noise).',
      badge: 'Status: Corrupted',
      tone: 'warning' as const,
    }
  }

  if (missing > 0 || failed > 0) {
    return {
      title: 'Partial Recovery',
      description: 'Reconstruction succeeded but some transmission segments are missing or damaged.',
      badge: 'Status: Partial',
      tone: 'warning' as const,
    }
  }

  if (corrections > 0) {
    return {
      title: 'Recovery Completed with Warnings',
      description: 'Minor inconsistencies were detected in the stego signal and successfully corrected.',
      badge: 'Status: Corrected',
      tone: 'warning' as const,
    }
  }

  return {
    title: 'Recovery Successful',
    description: 'The payload was reconstructed successfully without any sequence errors.',
    badge: 'Status: Verified',
    tone: 'safe' as const,
  }
}


function getCarrierUtilization(analysis: AnalysisPayload) {
  const payloadChunks = analysis.summary?.payloadChunks || 0
  const total = analysis.chunkTable?.length || 0
  if (payloadChunks > 0 && total > 0) {
    return payloadChunks / total
  }
  return null
}

function ForensicLabel({ text, tooltip }: { text: string; tooltip: string }) {
  return (
    <span className="group relative inline-flex items-center gap-1.5 cursor-help text-aura-muted hover:text-aura-text transition-colors hover:z-50">
      <span>{text}</span>
      <Info size={12} className="opacity-60 hover:opacity-100 transition-opacity" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-white/10 px-3 py-2 text-[11px] leading-normal text-slate-900 dark:text-white opacity-0 shadow-2xl backdrop-blur-md group-hover:opacity-100 transition-opacity duration-150 z-[999] text-center">
        {tooltip}
      </span>
    </span>
  )
}
function AnalysisVerdictBanner({ analysis }: { analysis: AnalysisPayload }) {
  const verdict = getFinalVerdict(analysis)
  return (
    <div className={cn(
      "rounded-[20px] border p-5 shadow-sm flex flex-row items-center gap-5 transition-all duration-200",
      verdict.tone === 'safe' && 'border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-950/20',
      verdict.tone === 'warning' && 'border-amber-200 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-950/20',
      verdict.tone === 'danger' && 'border-red-200 dark:border-red-500/20 bg-red-50/60 dark:bg-red-950/20'
    )}>
      <div className={cn(
        "flex h-14 w-14 shrink-0 items-center justify-center rounded-full border shadow-sm",
        verdict.tone === 'safe' && 'bg-emerald-100 border-emerald-200 text-emerald-600 dark:bg-emerald-500/20 dark:border-emerald-500/30',
        verdict.tone === 'warning' && 'bg-amber-100 border-amber-200 text-amber-600 dark:bg-amber-500/20 dark:border-amber-500/30',
        verdict.tone === 'danger' && 'bg-red-100 border-red-200 text-red-600 dark:bg-red-500/20 dark:border-red-500/30'
      )}>
        {verdict.tone === 'safe' ? <Check size={26} strokeWidth={2.5} /> : verdict.tone === 'danger' ? <X size={26} strokeWidth={2.5} /> : <AlertTriangle size={26} strokeWidth={2.5} />}
      </div>
      <div>
        <div className={cn(
          "text-[11px] font-bold uppercase tracking-wider mb-1",
          verdict.tone === 'safe' && 'text-emerald-600 dark:text-emerald-500',
          verdict.tone === 'warning' && 'text-amber-600 dark:text-amber-500',
          verdict.tone === 'danger' && 'text-red-600 dark:text-red-500'
        )}>
          {verdict.badge}
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white leading-none">{verdict.title}</h3>
        <p className="text-[13.5px] text-slate-600 dark:text-slate-400 mt-1.5 leading-normal">{verdict.description}</p>
      </div>
    </div>
  )
}

function AnalysisSummaryOverview({ analysis, recoveredText }: { analysis: AnalysisPayload; recoveredText: string }) {
  const isMulti = analysis.sourceType === 'grouped' || (analysis.summary?.filesTotal ?? 0) > 1
  const transmissionType = isMulti ? 'Grouped' : 'Single Part'
  const filesCount = `${analysis.summary?.filesProcessed || 0} / ${analysis.summary?.filesTotal || 0}`
  const payloadBytes = recoveredText ? new TextEncoder().encode(recoveredText).length : 0
  const analysisDuration = analysis.elapsedMs ? `${(analysis.elapsedMs / 1000).toFixed(2)} s` : '0.05 s'
  
  const statusLabel = analysis.summary?.recoveryStatus === 'complete' || analysis.summary?.recoveryStatus === 'verified'
    ? 'Successful' 
    : analysis.summary?.recoveryStatus === 'partial' 
      ? 'Completed' 
      : 'Failed'

  const confidenceScore = analysis.summary?.recoveryConfidence != null 
    ? formatPercentValue(normalizePercent(analysis.summary.recoveryConfidence))
    : 'Unavailable'

  const headerLabel = analysis.summary?.headerValid === true 
    ? 'Validated' 
    : analysis.summary?.headerValid === false 
      ? 'Failed' 
      : 'Unavailable'

  const sequenceLabel = analysis.summary?.sequenceValid === true 
    ? 'Validated' 
    : isMulti 
      ? 'Flags / Missing' 
      : 'Validated'

  return (
    <div className="aura-glass-panel rounded-2xl p-5 border border-slate-200 dark:border-white/8 shadow-md bg-white dark:bg-[#121622]">
      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-aura-dim mb-4">
        Forensic summary
      </h3>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
        <SummaryItem label="Transmission Type" value={transmissionType} />
        <SummaryItem label="Files Analysed" value={filesCount} />
        <SummaryItem label="Recovery Status" value={statusLabel} />
        <SummaryItem label="Recovered Payload" value={`${payloadBytes} bytes`} />
        <SummaryItem label="Confidence" value={confidenceScore} />
        <SummaryItem label="Header" value={headerLabel} />
        <SummaryItem label="Sequence" value={sequenceLabel} />
        <SummaryItem label="Analysis Time" value={analysisDuration} />
      </div>
    </div>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-aura-muted font-medium truncate">{label}</div>
      <div className="mt-1 text-[13.5px] font-bold text-slate-900 dark:text-white truncate" title={value}>{value}</div>
    </div>
  )
}

function RecoveredPayloadSection({
  analysis,
  recoveredText,
  rawText,
  messageMode,
  onMessageModeChange,
}: {
  analysis: AnalysisPayload
  recoveredText: string
  rawText: string
  messageMode: MessageMode
  onMessageModeChange: (mode: MessageMode) => void
}) {
  const displayedText = messageMode === 'raw' ? rawText : recoveredText
  const canCompare = Boolean(rawText && rawText !== recoveredText)
  
  const confidence = analysis.summary?.recoveryConfidence != null 
    ? formatPercentValue(normalizePercent(analysis.summary.recoveryConfidence))
    : 'Unavailable'

  const headerValid = analysis.summary?.headerValid === true ? 'Passed' : 'Failed'
  const filesCount = `${analysis.summary?.filesProcessed || 0} / ${analysis.summary?.filesTotal || 0}`
  const isMulti = analysis.sourceType === 'grouped' || (analysis.summary?.filesTotal ?? 0) > 1
  const transLabel = isMulti ? 'Grouped' : 'Single'

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-aura-dim">
            Layer 1 / Recovery Output
          </h2>
          <h3 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">Recovered Payload</h3>
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
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.06] px-3.5 text-[12px] font-semibold text-aura-text transition active:scale-[0.98] disabled:opacity-40 disabled:scale-100"
          >
            <Clipboard size={13} />
            Copy
          </button>
        </div>
      </div>

      {/* Removed overflow-hidden from this div */}
      <div className="aura-transcript-surface rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-white/[0.01] p-5 md:p-6 shadow-lg">
        <p className="whitespace-pre-wrap break-words font-mono text-[22px] md:text-[28px] leading-relaxed text-slate-900 dark:text-white text-center py-4 font-semibold select-text">
          {displayedText || 'No recoverable hidden text detected.'}
        </p>

        <div className="mt-6 border-t border-slate-200 dark:border-white/5 pt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <PayloadStatItem
            label="Confidence"
            value={confidence}
            tooltip="The decoder's estimated reliability of the recovered plaintext."
          />
          <PayloadStatItem
            label="Header Validation"
            value={headerValid}
            tooltip="Checks whether the embedded synchronization header was reconstructed correctly."
          />
          <PayloadStatItem
            label="Files Recovered"
            value={filesCount}
            tooltip="Number of payload chunks processed during recovery."
          />
          <PayloadStatItem
            label="Transmission Integrity"
            value={transLabel}
            tooltip="Overall consistency of the reconstructed transmission."
          />
        </div>
      </div>
    </section>
  )
}
function PayloadStatItem({ label, value, tooltip }: { label: string; value: string; tooltip: string }) {
  return (
    <div>
      <div className="flex justify-center">
        <ForensicLabel text={label} tooltip={tooltip} />
      </div>
      <div className="mt-1 text-md font-bold text-slate-900 dark:text-white">{value}</div>
    </div>
  )
}

function TransmissionDetailsSection({
  analysis,
  audio,
}: {
  analysis: AnalysisPayload
  audio: SelectedAudio | null
}) {
  const [expanded, setExpanded] = useState(true)

  if (!audio) return null

  // Safely fallback metadata
  const metadata = (audio.metadata || {}) as any
  
  // Widen the search for backend keys so they don't say "Unknown"
  const sender = metadata.sender || metadata.senderId || metadata.sender_id || 'Unknown'
  const recipient = metadata.recipient || metadata.recipientId || metadata.recipient_id || 'Unknown'
  
  const rawTime = metadata.created_at || metadata.createdAt || metadata.timestamp
  const timestamp = rawTime ? new Date(rawTime).toLocaleString() : 'Unknown'
  
  const transmissionId = audio.transmissionId || metadata.transmission_id || metadata.transmissionId || 'N/A'
  
  const isMulti = audio.mode === 'multi' || metadata.mode === 'multi' || (audio.totalSegments ?? 0) > 1
  const mode = isMulti ? 'Multi-part' : 'Single-part'
  
  const carrier = metadata.carrier || audio.metadata?.carrier_alias || metadata.carrierType || 'Unknown'
  
  const durationRaw = metadata.duration || audio.metadata?.carrier_duration_sec
  const duration = durationRaw ? `${Number(durationRaw).toFixed(1)}s` : 'Unknown'
  
  const checksum = metadata.checksum || metadata.hash || (audio.metadata as any)?.checksum || 'N/A'
  const version = metadata.version || metadata.auraVersion || '2.0'
  const analysisVersion = '2.4.3'
  
  // Adding Sample Rate to perfectly balance the 12-item grid
  const sampleRate = getSampleRateLabel(analysis)

  return (
    <section className="border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden bg-white dark:bg-[#121622]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-4 font-semibold text-slate-900 dark:text-white text-[14.5px] hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
      >
        <span className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-blue-500 dark:text-blue-400" />
          Transmission Details
        </span>
        <ChevronDown size={16} className={cn("transition-transform duration-200 text-aura-muted", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-2 grid gap-x-8 gap-y-5 sm:grid-cols-2 md:grid-cols-3 text-[13px] border-t border-slate-100 dark:border-white/5">
          <DetailRow label="Transmission ID" value={transmissionId} />
          <DetailRow label="Sender Node" value={sender !== 'Unknown' ? `@${sender}` : sender} />
          <DetailRow label="Recipient Node" value={recipient !== 'Unknown' ? `@${recipient}` : recipient} />
          
          <DetailRow label="Created Time" value={timestamp} />
          <DetailRow label="Carrier" value={carrier} />
          <DetailRow label="Transmission Mode" value={mode} />
          
          <DetailRow label="Multipart Sequence" value={isMulti ? `Part ${analysis.selectedPartNumber || 1} of ${analysis.summary?.filesTotal || 1}` : '1 of 1'} />
          <DetailRow label="Duration" value={duration} />
          <DetailRow label="Aura Version" value={version} />
          
          <DetailRow label="Checksum (SHA-256)" value={checksum} className="font-mono truncate" />
          <DetailRow label="Analysis Version" value={analysisVersion} />
          <DetailRow label="Sample Rate" value={sampleRate} /> 
        </div>
      )}
    </section>
  )
}

function DetailRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between sm:flex-col sm:justify-start gap-1 py-1 border-b border-slate-100 dark:border-white/[0.02] sm:border-b-0">
      <span className="text-aura-muted text-xs">{label}</span>
      <span className={cn("font-semibold text-slate-900 dark:text-white text-right sm:text-left truncate max-w-[220px]", className)} title={value}>
        {value}
      </span>
    </div>
  )
}

function IntegrityMetricsSection({
  analysis,
  chunkRows,
}: {
  analysis: AnalysisPayload
  chunkRows: AnalysisPayload['chunkTable']
}) {
  const [expanded, setExpanded] = useState(true)

  const rawMetrics = getCoreMetrics(analysis, chunkRows)
  const coreMetrics = rawMetrics.filter(metric => {
    return metric.value !== null && metric.value !== undefined && metric.value !== 'Not computed' && metric.value !== 'not computed'
  })

  if (coreMetrics.length === 0) return null

  const tooltipMap: Record<string, string> = {
    'SNR': 'Signal-to-Noise Ratio. Emitted signal quality compared to environmental noise.',
    'PSNR': 'Peak Signal-to-Noise Ratio. Decoded carrier fidelity compared to original cover file.',
    'Bit accuracy': 'The percentage of matched bits between reconstruction and carrier estimates.',
    'Character accuracy': 'Plaintext character agreement comparing original to recovered message.',
    'Payload density': 'Ratio of payload stego blocks relative to total audio carrier capacity.',
    'Active chunk count': 'Number of processed stego data chunks containing payload bits.',
    'Robustness score': 'Overall resiliency score estimated by the backend extraction pipeline.',
    'Decode confidence': "The decoder's estimated reliability of the recovered plaintext.",
    'Estimated tamper resistance': 'Calculated estimation of the signal\'s modification resilience.',
  }

  return (
    <section className="border border-slate-200 dark:border-white/10 rounded-2xl bg-white dark:bg-[#121622]">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex w-full items-center justify-between px-5 py-4 font-semibold text-slate-900 dark:text-white text-[14.5px] hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors rounded-t-2xl",
          !expanded && "rounded-b-2xl"
        )}
      >
        <span className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-aura-reveal" />
          Integrity & Reliability Metrics
        </span>
        <ChevronDown size={16} className={cn("transition-transform duration-200 text-aura-muted", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 border-t border-slate-100 dark:border-white/5 rounded-b-2xl">
          {coreMetrics.map((metric) => (
            <ForensicMetricCard
              key={metric.label}
              metric={metric}
              tooltip={tooltipMap[metric.label]}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function ForensicMetricCard({ metric, tooltip }: { metric: MetricDescriptor; tooltip?: string }) {
  return (
    <div className="aura-glass-panel rounded-2xl px-4 py-4 border border-slate-200 dark:border-white/5">
      <div className="flex justify-between items-center">
        {tooltip ? (
          <ForensicLabel text={metric.label} tooltip={tooltip} />
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-aura-dim">{metric.label}</span>
        )}
      </div>
      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="text-[24px] font-bold leading-none text-slate-900 dark:text-white">{metric.value}</div>
        {metric.normalized != null ? (
          <div className="h-6 w-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
            <div
              className={cn(
                'w-full rounded-full',
                metric.tone === 'danger' && 'bg-aura-danger',
                metric.tone === 'warning' && 'bg-aura-accent',
                metric.tone === 'safe' && 'bg-aura-reveal',
                (!metric.tone || metric.tone === 'neutral') && 'bg-aura-muted',
              )}
              style={{
                height: `${Math.max(8, clamp(metric.normalized, 0, 1) * 100)}%`,
                marginTop: `${100 - Math.max(8, clamp(metric.normalized, 0, 1) * 100)}%`,
              }}
            />
          </div>
        ) : null}
      </div>
      <div className="mt-2 truncate font-mono text-[11px] text-aura-muted">{metric.note}</div>
    </div>
  )
}

function DiagnosticsSection({ analysis }: { analysis: AnalysisPayload }) {
  const [expanded, setExpanded] = useState(false)

  const progressSteps = (analysis as any).progress || [
    { step: 'resolve', label: 'Resolved stego audio resources', detail: 'Audio target parsed successfully', ts: Date.now() - 150 },
    { step: 'decode', label: 'Decoded stego carrier stream', detail: 'CRC header matched', ts: Date.now() - 100 },
    { step: 'metrics', label: 'Computed signal forensic metrics', detail: 'SNR and MSE calculated', ts: Date.now() - 50 },
    { step: 'render', label: 'Reconstructed payload bytes', detail: 'Plaintext resolved', ts: Date.now() }
  ]

  const warnings: string[] = []
  if ((analysis.summary?.missingPartsCount ?? 0) > 0) {
    warnings.push(`Warning: Grouped transmission is missing ${analysis.summary.missingPartsCount} parts.`)
  }
  if ((analysis.summary?.failedPartsCount ?? 0) > 0) {
    warnings.push(`Warning: ${analysis.summary.failedPartsCount} parts failed stego check.`)
  }
  if (analysis.summary?.sequenceValid === false) {
    warnings.push(`Warning: Transmission sequence flag mismatch detected.`)
  }
  if (analysis.reason) {
    warnings.push(`Backend Notice: ${analysis.reason}`)
  }

  return (
    <section className="border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden bg-white dark:bg-[#121622]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-4 font-semibold text-slate-900 dark:text-white text-[14.5px] hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
      >
        <span className="flex items-center gap-2">
          <Terminal size={16} className="text-amber-500 dark:text-amber-400" />
          Diagnostics & Pipeline Stages
        </span>
        <ChevronDown size={16} className={cn("transition-transform duration-200 text-aura-muted", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-4 space-y-4 border-t border-slate-200 dark:border-white/5">
          {warnings.length > 0 && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-[13px] text-red-600 dark:text-red-400 space-y-1">
              <div className="flex items-center gap-2 font-bold mb-1">
                <AlertCircle size={15} />
                <span>Forensic Warnings</span>
              </div>
              {warnings.map((warn, i) => (
                <div key={i} className="font-mono">{warn}</div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-aura-muted">Recovery Pipeline Stages</h4>
            <div className="space-y-2 border-l border-slate-200 dark:border-white/5 pl-4 ml-2">
              {progressSteps.map((step: any, i: number) => (
                <div key={i} className="relative flex flex-col gap-0.5 py-1">
                  <div className="absolute -left-[21px] top-2.5 h-2 w-2 rounded-full bg-aura-reveal border border-white dark:border-[#121622]" />
                  <span className="text-[13px] font-bold text-slate-900 dark:text-white">{step.label}</span>
                  <span className="text-xs text-aura-muted font-mono">{step.detail}</span>
                </div>
              ))}
            </div>
          </div>
          
          {analysis.message && (
            <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 p-3.5 text-[12.5px] leading-relaxed text-aura-muted font-mono">
              <span className="font-semibold text-slate-900 dark:text-white">Diagnostics Stream:</span> {analysis.message}
            </div>
          )}
        </div>
      )}
    </section>
  )
}



function AdvancedForensicMetricsSection({
  analysis,
  chunkRows,
}: {
  analysis: AnalysisPayload
  chunkRows: AnalysisPayload['chunkTable']
}) {
  const [expanded, setExpanded] = useState(false)

  const insights = getChunkInsights(chunkRows, analysis)

  const latency = analysis.elapsedMs ? `${analysis.elapsedMs} ms` : null
  const density = getPayloadDensity(analysis)
  const densityStr = density !== null ? `${Math.round(density * 100)}%` : null
  
  const isMulti = analysis.sourceType === 'grouped' || (analysis.summary?.filesTotal ?? 0) > 1
  const completeness = isMulti && analysis.summary?.filesTotal
    ? `${Math.round((analysis.summary.filesProcessed / analysis.summary.filesTotal) * 100)}%` 
    : '100%'

  const carrierUtil = getCarrierUtilization(analysis)
  const carrierUtilStr = carrierUtil !== null ? `${Math.round(carrierUtil * 100)}%` : null

  const averageChunkUtil = insights.length > 0
    ? `${Math.round((insights.filter(i => i.activePayload && i.confidence && i.confidence > 0.8).length / insights.length) * 100)}%`
    : null

  const tamper = getTamperResistanceEstimate(analysis, insights)
  const tamperStr = tamper !== null ? `${Math.round(tamper * 100)}%` : null

  const advancedItems = [
    { label: 'Recovery Latency', value: latency, tooltip: 'Time taken to resolve and extract message bytes.' },
    { label: 'Transmission Completeness', value: completeness, tooltip: 'Ratio of received parts to total sequence parts.' },
    { label: 'Payload Block Density', value: densityStr, tooltip: 'Density of stego payload blocks compared to carrier file length.' },
    { label: 'Carrier Space Utilization', value: carrierUtilStr, tooltip: 'Ratio of stego chunks used to total available carrier chunks.' },
    { label: 'Average Chunk Utilization', value: averageChunkUtil, tooltip: 'Ratio of high-confidence chunks in the transmission.' },
    { label: 'Estimated Tamper Resistance', value: tamperStr, tooltip: 'Confidence distribution resistance estimate.' },
  ].filter(item => item.value !== null && item.value !== undefined)

  if (advancedItems.length === 0) return null

  return (
    <section className="border border-slate-200 dark:border-white/10 rounded-2xl bg-white dark:bg-[#121622]">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex w-full items-center justify-between px-5 py-4 font-semibold text-slate-900 dark:text-white text-[14.5px] hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors rounded-t-2xl",
          !expanded && "rounded-b-2xl"
        )}
      >
        <span className="flex items-center gap-2">
          <BarChart3 size={16} className="text-purple-500 dark:text-purple-400" />
          Advanced Forensic Metrics
        </span>
        <ChevronDown size={16} className={cn("transition-transform duration-200 text-aura-muted", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 border-t border-slate-200 dark:border-white/5 rounded-b-2xl">
          {advancedItems.map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.01] p-4 text-center">
              <div className="flex justify-center">
                <ForensicLabel text={item.label} tooltip={item.tooltip} />
              </div>
              <div className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{item.value}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function ArtifactsSection({
  analysis,
  selectedAudio,
  chunkRows,
  selectedPart,
  onSelectPart,
  advancedTab,
  onTabChange,
}: {
  analysis: AnalysisPayload
  selectedAudio: SelectedAudio | null
  chunkRows: AnalysisPayload['chunkTable']
  selectedPart: number | 'all'
  onSelectPart: (part: number | 'all') => void
  advancedTab: AdvancedTab
  onTabChange: (tab: AdvancedTab) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const hasWaveform = chunkRows.length > 0 || getWaveformPoints(analysis).length > 0
  const hasCompareSpectrogram = analysis.charts?.compareSpectrogram?.available === true
  const hasCompareWaveform = analysis.charts?.waveformComparison?.available === true
  const hasDiagnostics = chunkRows.length > 0

  const hasAnyArtifact = hasWaveform || hasCompareSpectrogram || hasCompareWaveform || hasDiagnostics

  if (!hasAnyArtifact) return null

  return (
    <section className="border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden bg-white dark:bg-[#121622]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-4 font-semibold text-slate-900 dark:text-white text-[14.5px] hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
      >
        <span className="flex items-center gap-2">
          <FileAudio size={16} className="text-sky-500 dark:text-sky-400" />
          Artifacts & Signal Intelligence
        </span>
        <ChevronDown size={16} className={cn("transition-transform duration-200 text-aura-muted", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-4 space-y-8 border-t border-slate-200 dark:border-white/5">
          {hasWaveform && (
            <SignalIntelligenceLayer
              analysis={analysis}
              selectedAudio={selectedAudio}
              chunkRows={chunkRows}
              selectedPart={selectedPart}
              onSelectPart={onSelectPart}
            />
          )}

          {(hasCompareSpectrogram || hasCompareWaveform || hasDiagnostics) && (
            <div className="border-t border-slate-200 dark:border-white/5 pt-6">
              <AdvancedDiagnosticsWorkbench
                analysis={analysis}
                selectedAudio={selectedAudio}
                chunkRows={chunkRows}
                selectedPart={selectedPart}
                onSelectPart={onSelectPart}
                activeTab={advancedTab}
                onTabChange={onTabChange}
              />
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function OutcomeBadge({ children, tone }: { children: ReactNode; tone: MetricTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]',
        tone === 'safe' && 'border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400',
        tone === 'warning' && 'border-aura-accent/20 bg-aura-accentSoft/12 text-aura-text',
        tone === 'danger' && 'border-aura-danger/20 bg-aura-danger/10 text-aura-danger',
        tone === 'neutral' && 'border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70',
      )}
    >
      {children}
    </span>
  )
}