import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  FileAudio,
  LoaderCircle,
  RotateCcw,
  Upload,
  Wand2,
} from 'lucide-react'
import { Badge, Stat } from '../components/AuraPrimitives'
import { decodeByReference, decodeUpload, decodeUploads, resolveUrl } from '../services/api'
import type { DecodeChange, DecodeResult, SelectedAudio } from '../types'

type Props = {
  selectedAudio: SelectedAudio | null
  decodeResult: DecodeResult | null
  onDecoded: (result: DecodeResult) => void
}

type RevealInputFile = {
  id: string
  file?: File
  fileName: string
  audioUrl?: string
  source: 'upload' | 'chat'
  transmissionId?: string
  segmentIndex?: number
  totalSegments?: number
  durationSec?: number
  isPlayable?: boolean
  previewUrl?: string
}

type RevealSessionState = {
  mode: 'idle' | 'single' | 'multi'
  files: RevealInputFile[]
  transmissionId?: string
  expectedSegments?: number
  sorted: boolean
}

type RevealResult = {
  success: boolean
  mode: 'single' | 'multi'
  transmission_id?: string
  total_segments?: number
  received_segments?: number
  missing_segments: number[]
  recovery_status: 'complete' | 'incomplete' | 'failed' | 'exact' | 'minor_corrected' | 'boundary_repair' | 'low_confidence'
  recovered_text: string
  raw_text: string
  corrected_text: string
  changes: DecodeChange[]
  total_chunks?: number
  header_chunks?: number
  decoded_message_length?: number
  payload_chunks_needed?: number
  ignored_tail_chunks?: number
  header_valid?: boolean
  segments: Array<{
    segment_index?: number
    file_name?: string
    decoded_text?: string
  }>
  error?: string
}

type RevealRunStatus = 'idle' | 'running' | 'completed' | 'failed'

type RevealPartStatus =
  | 'idle'
  | 'queued'
  | 'active'
  | 'completedJustNow'
  | 'completed'
  | 'failed'

type RevealPartState = {
  id: string
  partNumber: number
  fileName: string
  status: RevealPartStatus
  completedAt?: number
}

type Phase = {
  label: string
  caption: string
  status: string
}

const SINGLE_PHASES: Phase[] = [
  {
    label: 'Carrier loaded',
    caption: 'Approved speech carrier detected and ready for analysis.',
    status: 'preparing carrier input',
  },
  {
    label: 'Length header decoded',
    caption: 'Recovered the 2-byte message header and estimated payload size.',
    status: 'reading length header...',
  },
  {
    label: 'Payload extracted',
    caption: 'Recovered protected payload chunks using repeat-3 voting.',
    status: 'recovering payload chunks...',
  },
  {
    label: 'Text reconstructed',
    caption: 'Converted the recovered nibble stream into ASCII text.',
    status: 'reconstructing ASCII stream...',
  },
  {
    label: 'Final verification',
    caption: 'Applied post-processing heuristics and finalized the reveal.',
    status: 'applying correction pass...',
  },
]

const TIMEOUT_MS = 60_000
const ESTIMATE_DELAY_MS = 2_500
const PART_COMPLETION_SETTLE_MS = 900

class RevealErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="rounded-2xl border border-aura-danger/20 bg-aura-danger/8 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 text-aura-danger" size={18} />
          <div>
            <div className="font-semibold text-aura-text">
              Reveal session encountered an unexpected UI error.
            </div>
            <p className="mt-1 text-sm leading-6 text-aura-muted">
              The rest of Aura is still active. Reset this reveal session and retry the
              selected audio from Chat if needed.
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false })
                this.props.onReset()
              }}
              className="mt-4 inline-flex items-center rounded-xl border border-aura-border/12 bg-aura-bg/35 px-4 py-2 text-sm font-semibold text-aura-text"
            >
              <RotateCcw size={15} className="mr-2" />
              Reset session
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export function RevealPageV2(props: Props) {
  const [boundaryKey, setBoundaryKey] = useState(0)
  return (
    <RevealErrorBoundary
      key={boundaryKey}
      onReset={() => setBoundaryKey((current) => current + 1)}
    >
      <RevealPageContent {...props} />
    </RevealErrorBoundary>
  )
}

function RevealPageContent({ selectedAudio, decodeResult, onDecoded }: Props) {
  const [uploadedFiles, setUploadedFiles] = useState<RevealInputFile[]>([])
  const [runStatus, setRunStatus] = useState<RevealRunStatus>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rawOpen, setRawOpen] = useState(false)
  const [partsOpen, setPartsOpen] = useState(false)
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const [audioUnavailable, setAudioUnavailable] = useState<Record<string, boolean>>({})
  const [localResult, setLocalResult] = useState<RevealResult | null>(null)
  const [partStates, setPartStates] = useState<RevealPartState[]>([])

  const startTimeRef = useRef<number>(0)
  const estimateRef = useRef<number>(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const partTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const mountedRef = useRef(true)

  const selectedFiles = useMemo(
    () => buildSelectedAudioFiles(selectedAudio),
    [selectedAudio],
  )
  const session = useMemo(
    () => buildSession(selectedFiles.length ? selectedFiles : uploadedFiles),
    [selectedFiles, uploadedFiles],
  )
  const normalizedResult = useMemo(
    () => localResult ?? normalizeRevealResponse(decodeResult),
    [decodeResult, localResult],
  )
  const hasResult = Boolean(normalizedResult)
  const phases = getRevealPhases(session, normalizedResult)
  const activePhase = phases[Math.min(phaseIndex, phases.length - 1)] ?? phases[0]
  const estimateVisible = busy && elapsedMs >= ESTIMATE_DELAY_MS
  const estimatedRemainingMs = estimateVisible
    ? Math.max(0, estimateRef.current - elapsedMs)
    : null
  const remainingLabel = getRemainingLabel({
    status: runStatus,
    etaSeconds: estimatedRemainingMs === null ? null : estimatedRemainingMs / 1000,
    elapsedSeconds: elapsedMs / 1000,
    phase: activePhase?.status,
  })
  const filesProgressLabel = getFilesProgressLabel(partStates, session.files.length)
  const showDelayWarning = runStatus === 'running' && timedOut
  const phaseLabel = getPhaseLabel(runStatus, activePhase?.status, normalizedResult)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTimers()
      clearPartTimeouts()
      revokeObjectUrls(uploadedFiles)
    }
  }, [])

  useEffect(() => {
    if (busy || normalizedResult) return
    setPartStates(buildInitialPartStates(session.files))
  }, [busy, normalizedResult, session.files])

  useEffect(() => {
    if (!busy || session.mode !== 'multi' || !session.files.length) return
    const total = session.files.length
    const progressRatio = Math.max(0, Math.min(1, progress / 100))
    const estimatedCompleted = Math.min(total - 1, Math.floor(progressRatio * total))
    const activeIndex = Math.min(total - 1, estimatedCompleted)
    setPartStates((current) =>
      syncRunningPartStates(current, session.files, estimatedCompleted, activeIndex),
    )
  }, [busy, progress, session.files, session.mode])

  useEffect(() => {
    if (!normalizedResult || session.mode !== 'multi') return
    setPartStates((current) => syncCompletedPartStates(current, session.files, normalizedResult))
  }, [normalizedResult, session.files, session.mode])

  useEffect(() => {
    const pending = partStates.filter((part) => part.status === 'completedJustNow')
    pending.forEach((part) => {
      if (partTimeoutsRef.current[part.id]) return
      partTimeoutsRef.current[part.id] = setTimeout(() => {
        delete partTimeoutsRef.current[part.id]
        if (!mountedRef.current) return
        setPartStates((current) =>
          current.map((entry) =>
            entry.id === part.id && entry.status === 'completedJustNow'
              ? { ...entry, status: 'completed' }
              : entry,
          ),
        )
      }, PART_COMPLETION_SETTLE_MS)
    })
  }, [partStates])

  useEffect(() => {
    if (selectedAudio) {
      setUploadedFiles((current) => {
        revokeObjectUrls(current)
        return []
      })
      resetSession(false)
      void startReveal()
    }
    // Preserve selected-audio auto-decode without re-triggering on unrelated state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAudio?.messageId, selectedAudio?.transmissionId])

  function clearTimers() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  function clearPartTimeouts() {
    Object.values(partTimeoutsRef.current).forEach((timer) => clearTimeout(timer))
    partTimeoutsRef.current = {}
  }

  function resetSession(clearUploads = true) {
    clearTimers()
    clearPartTimeouts()
    setRunStatus('idle')
    setBusy(false)
    setError('')
    setRawOpen(false)
    setPartsOpen(false)
    setPhaseIndex(0)
    setProgress(0)
    setElapsedMs(0)
    setTimedOut(false)
    setAudioUnavailable({})
    setLocalResult(null)
    setPartStates(buildInitialPartStates(clearUploads ? [] : session.files))
    if (clearUploads) {
      setUploadedFiles((current) => {
        revokeObjectUrls(current)
        return []
      })
    }
  }

  function startTimers(activeSession: RevealSessionState) {
    clearTimers()
    startTimeRef.current = Date.now()
    estimateRef.current = estimateDuration(activeSession)
    setElapsedMs(0)
    setProgress(4)
    setPhaseIndex(0)
    setTimedOut(false)
    setRunStatus('running')

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      const pct = Math.min(94, Math.max(4, Math.round((elapsed / estimateRef.current) * 92)))
      const phase = Math.min(
        phases.length - 1,
        Math.floor((pct / 94) * phases.length),
      )
      if (!mountedRef.current) return
      setElapsedMs(elapsed)
      setProgress(Math.max(4, pct))
      setPhaseIndex(phase)
    }, 250)

    timeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return
      setTimedOut(true)
    }, TIMEOUT_MS)
  }

  async function startReveal() {
    if (busy) return
    if (!session.files.length) return

    setBusy(true)
    setError('')
    setRawOpen(false)
    setPartsOpen(false)
    setLocalResult(null)
    clearPartTimeouts()
    setPartStates(buildInitialPartStates(session.files, true))
    startTimers(session)

    try {
      const raw =
        selectedAudio && selectedFiles.length
          ? await decodeByReference(
              selectedAudio.transmissionId || selectedAudio.messageId,
              selectedAudio.audioUrl,
              selectedAudio.mode === 'multi'
                ? selectedFiles.map((file) => ({ audio_url: file.audioUrl }))
                : undefined,
            )
          : session.files.length > 1
            ? await decodeUploads(session.files.map((item) => item.file).filter(Boolean) as File[])
            : session.files[0]?.file
              ? await decodeUpload(session.files[0].file)
              : null

      if (!mountedRef.current) return
      const normalized = normalizeRevealResponse(raw, session)
      if (!normalized) {
        setRunStatus('failed')
        setError('Decode completed without a readable response.')
        return
      }
      setLocalResult(normalized)
      setProgress(normalized.success ? 100 : Math.max(progress, 96))
      setPhaseIndex(phases.length - 1)
      setRunStatus(normalized.success ? 'completed' : 'failed')
      setTimedOut(false)
      setError(normalized.success ? '' : normalized.error || '')
      if (raw) onDecoded(normalizedToDecodeResult(normalized, raw))
    } catch (err) {
      if (!mountedRef.current) return
      setProgress(Math.max(progress, 96))
      setPhaseIndex(phases.length - 1)
      const message = err instanceof Error ? err.message : 'Decode failed.'
      setRunStatus('failed')
      setTimedOut(false)
      setError(message)
      setLocalResult({
        success: false,
        mode: session.mode === 'multi' ? 'multi' : 'single',
        missing_segments: [],
        recovery_status: 'failed',
        recovered_text: '',
        corrected_text: '',
        raw_text: '',
        changes: [],
        segments: [],
        error: message,
      })
    } finally {
      clearTimers()
      if (mountedRef.current) {
        setBusy(false)
        setElapsedMs(Date.now() - startTimeRef.current)
      }
    }
  }

  function handleUpload(files: FileList | null) {
    const nextFiles = Array.from(files ?? [])
      .filter((file) => file.name.toLowerCase().endsWith('.wav'))
      .map(fileToRevealInput)
    setUploadedFiles((current) => {
      revokeObjectUrls(current)
      return nextFiles
    })
    setError('')
    setRawOpen(false)
    setPartsOpen(false)
    setLocalResult(null)
    setRunStatus('idle')
    setTimedOut(false)
  }

  const selectedLabel = session.files.length === 1 ? 'Single carrier' : 'Grouped transmission'
  const sequenceLabel = session.sorted ? 'Sequence verified' : 'Sequence inferred from upload order'
  const recoveredText =
    normalizedResult?.mode === 'multi' && normalizedResult?.recovery_status !== 'complete'
      ? ''
      : normalizedResult?.recovered_text ||
    normalizedResult?.corrected_text ||
    normalizedResult?.raw_text ||
    ''
  const changes = normalizedResult?.changes ?? []
  const segments = normalizedResult?.segments ?? []
  const missingSegments = normalizedResult?.missing_segments ?? []

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-aura-border/10 bg-aura-surface p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-aura-muted/60">
                  Reveal input
                </div>
                <div className="mt-1 text-lg font-semibold text-aura-text">
                  {session.mode === 'idle' ? 'No carrier selected' : selectedLabel}
                </div>
              </div>
              {session.mode !== 'idle' ? (
                <Badge tone={session.sorted ? 'safe' : 'accent'}>{sequenceLabel}</Badge>
              ) : null}
            </div>

            {session.files.length ? (
              <InputSummary
                files={session.files}
                partStates={partStates}
                runStatus={runStatus}
                audioUnavailable={audioUnavailable}
                onAudioError={(id) =>
                  setAudioUnavailable((current) => ({ ...current, [id]: true }))
                }
              />
            ) : (
              <label className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-aura-border/14 bg-aura-bg/35 px-5 py-8 text-center text-sm text-aura-muted transition-colors hover:border-aura-reveal/24 hover:text-aura-text">
                <Upload size={22} className="mb-2 text-aura-dim" />
                Upload one or more stego WAV files
                <span className="mt-1 text-xs text-aura-dim">
                  Multi-carrier filenames like tx_id_part_01_of_03.wav are sorted automatically.
                </span>
                <input
                  type="file"
                  multiple
                  accept=".wav,audio/wav"
                  className="hidden"
                  onChange={(event) => handleUpload(event.target.files)}
                />
              </label>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || session.files.length === 0}
                onClick={() => void startReveal()}
                className="inline-flex items-center rounded-xl border border-aura-reveal/24 bg-aura-reveal/12 px-4 py-2.5 text-sm font-semibold text-aura-reveal transition-colors hover:bg-aura-reveal/16 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {busy ? (
                  <LoaderCircle size={15} className="mr-2 animate-spin" />
                ) : (
                  <Wand2 size={15} className="mr-2" />
                )}
                {busy ? 'Revealing...' : runStatus === 'completed' ? 'Run Again' : 'Start Reveal'}
              </button>
              <button
                type="button"
                onClick={() => resetSession(!selectedAudio)}
                className="inline-flex items-center rounded-xl border border-aura-border/12 bg-aura-bg/35 px-4 py-2.5 text-sm font-semibold text-aura-text transition-colors hover:bg-aura-surface/55"
              >
                <RotateCcw size={15} className="mr-2" />
                Reset
              </button>
            </div>
          </div>

          <PhaseRail
            phases={phases}
            phaseIndex={phaseIndex}
            complete={hasResult && !busy}
            idle={session.mode === 'idle' && !busy && !hasResult}
          />
        </section>

        <section className="space-y-4">
          <StatusPanel
            error={error}
            progress={progress}
            elapsedMs={elapsedMs}
            remainingLabel={remainingLabel}
            filesProgressLabel={filesProgressLabel}
            phaseLabel={phaseLabel}
            result={normalizedResult}
            runStatus={runStatus}
            showDelayWarning={showDelayWarning}
          />

          {normalizedResult ? (
            <ResultPanel
              result={normalizedResult}
              recoveredText={recoveredText}
              rawOpen={rawOpen}
              partsOpen={partsOpen}
              changes={changes}
              segments={segments}
              missingSegments={missingSegments}
              onToggleRaw={() => setRawOpen((value) => !value)}
              onToggleParts={() => setPartsOpen((value) => !value)}
            />
          ) : (
            <IdlePanel mode={session.mode} />
          )}
        </section>
      </div>

      {import.meta.env.DEV ? (
        <div className="rounded-xl border border-aura-border/8 bg-aura-bg/30 px-3 py-2 font-mono text-[11px] text-aura-dim">
          selected={selectedAudio?.messageId ?? selectedAudio?.transmissionId ?? 'none'} ·
          decoded={decodeResult?.message_id ?? decodeResult?.transmission_id ?? 'none'}
        </div>
      ) : null}
    </div>
  )
}

function InputSummary({
  files,
  partStates,
  runStatus,
  audioUnavailable,
  onAudioError,
}: {
  files: RevealInputFile[]
  partStates: RevealPartState[]
  runStatus: RevealRunStatus
  audioUnavailable: Record<string, boolean>
  onAudioError: (id: string) => void
}) {
  const first = files[0]
  const isMulti = files.length > 1
  const stateMap = new Map(partStates.map((part) => [part.id, part]))

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-aura-bg/35 p-3 ring-1 ring-aura-border/8">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-aura-reveal/10 text-aura-reveal">
            <FileAudio size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-aura-text">
              {isMulti ? files[0]?.transmissionId || 'Grouped Aura transmission' : first?.fileName || 'Unknown WAV'}
            </div>
            <div className="mt-1 text-xs text-aura-muted">
              {isMulti ? `${files.length} parts detected` : first?.source === 'chat' ? 'From Chat' : 'Uploaded WAV'}
            </div>
          </div>
        </div>
      </div>

      {!isMulti && first ? (
        <AudioPreview file={first} unavailable={audioUnavailable[first.id]} onError={onAudioError} />
      ) : (
        <div className="space-y-2">
          {files.map((file, index) => {
            const partState = stateMap.get(file.id)
            const status = partState?.status ?? (runStatus === 'completed' ? 'completed' : 'queued')
            const isActive = status === 'active'
            const isDone = status === 'completed' || status === 'completedJustNow'
            const isNew = status === 'completedJustNow'
            const isFailed = status === 'failed'
            return (
              <div
                key={file.id}
                className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ring-1 transition-all duration-500 ${
                  isActive
                    ? 'bg-aura-reveal/8 ring-aura-reveal/25 shadow-[0_0_0_1px_rgba(114,209,199,0.08)]'
                    : isDone
                      ? 'bg-aura-reveal/6 ring-aura-reveal/18'
                      : isFailed
                        ? 'bg-aura-danger/6 ring-aura-danger/20'
                        : 'bg-aura-bg/32 ring-aura-border/7'
                } ${isNew ? 'scale-[1.01]' : 'scale-100'}`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-aura-text">
                    Part {(file.segmentIndex ?? index) + 1} of {file.totalSegments ?? files.length}
                  </div>
                  <div className="truncate text-xs text-aura-muted">{file.fileName}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300 ${
                      isActive
                        ? 'bg-aura-reveal/12 text-aura-reveal'
                        : isDone
                          ? 'bg-aura-reveal/14 text-aura-reveal'
                          : isFailed
                            ? 'bg-aura-danger/12 text-aura-danger'
                            : 'bg-aura-bg/60 text-aura-dim'
                    }`}
                  >
                    {isActive ? (
                      <LoaderCircle size={13} className="animate-spin" />
                    ) : isDone ? (
                      <CheckCircle2 size={14} className={isNew ? 'scale-110 transition-transform duration-300' : ''} />
                    ) : isFailed ? (
                      <AlertTriangle size={13} />
                    ) : (
                      <Circle size={12} />
                    )}
                  </div>
                  <Badge tone={isFailed ? 'danger' : isDone ? 'safe' : isActive ? 'accent' : file.segmentIndex !== undefined ? 'safe' : 'neutral'}>
                    {isFailed
                      ? 'failed'
                      : isDone
                        ? 'complete'
                        : isActive
                          ? 'processing'
                          : file.segmentIndex !== undefined
                            ? 'parsed'
                            : 'ordered'}
                  </Badge>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AudioPreview({
  file,
  unavailable,
  onError,
}: {
  file: RevealInputFile
  unavailable?: boolean
  onError: (id: string) => void
}) {
  const src = file.previewUrl || resolveUrl(file.audioUrl || '')
  if (!src || unavailable) {
    return (
      <div className="rounded-xl border border-aura-border/10 bg-aura-bg/35 px-3 py-3 text-sm text-aura-muted">
        Audio preview unavailable. Reveal can still run from the selected metadata or uploaded file.
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-aura-bg/35 p-2 ring-1 ring-aura-border/8">
      <audio
        controls
        preload="metadata"
        src={src}
        onError={() => onError(file.id)}
        className="w-full"
      />
    </div>
  )
}

function PhaseRail({
  phases,
  phaseIndex,
  complete,
  idle,
}: {
  phases: Phase[]
  phaseIndex: number
  complete: boolean
  idle: boolean
}) {
  return (
    <div className="rounded-2xl border border-aura-border/10 bg-aura-surface p-4 shadow-sm">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-aura-muted/60">
        Reveal sequence
      </div>
      {idle ? (
        <div className="rounded-xl border border-aura-border/8 bg-aura-bg/35 px-3.5 py-3.5">
          <p className="text-sm leading-6 text-aura-muted">
            Aura will decode the 2-byte header, recover payload chunks, and reconstruct
            the concealed message.
          </p>
        </div>
      ) : (
        <ol className="space-y-2.5">
          {phases.map((phase, index) => {
            const done = complete || index < phaseIndex
            const active = !complete && index === phaseIndex
            return (
              <li key={phase.label} className="flex gap-3">
                <div
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    done
                      ? 'text-aura-reveal'
                      : active
                        ? 'bg-aura-reveal/12 text-aura-reveal shadow-[0_0_0_4px_rgba(114,209,199,0.07)]'
                        : 'text-aura-border/30'
                  }`}
                >
                  {done ? <CheckCircle2 size={16} /> : active ? <Circle size={14} className="animate-pulse" /> : <Circle size={14} />}
                </div>
                <div>
                  <div className={`text-sm font-semibold ${active ? 'text-aura-reveal' : done ? 'text-aura-text' : 'text-aura-muted/55'}`}>
                    {phase.label}
                  </div>
                  <div className="mt-0.5 text-xs leading-5 text-aura-muted">{phase.caption}</div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function StatusPanel({
  error,
  progress,
  elapsedMs,
  remainingLabel,
  filesProgressLabel,
  phaseLabel,
  result,
  runStatus,
  showDelayWarning,
}: {
  error: string
  progress: number
  elapsedMs: number
  remainingLabel: string
  filesProgressLabel: string
  phaseLabel: string
  result: RevealResult | null
  runStatus: RevealRunStatus
  showDelayWarning: boolean
}) {
  const statusTone =
    runStatus === 'completed'
      ? 'safe'
      : runStatus === 'failed' || error
        ? 'danger'
        : runStatus === 'running'
          ? 'accent'
          : 'neutral'

  return (
    <div className="rounded-2xl border border-aura-border/10 bg-aura-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-aura-muted/60">
            Recovery status
          </div>
          <div className="mt-1 text-sm font-semibold text-aura-text">{phaseLabel}</div>
        </div>
        <Badge tone={statusTone}>
          {runStatus === 'running' ? 'Running' : runStatus === 'completed' ? 'Complete' : runStatus === 'failed' ? 'Failed' : result ? userFacingRecoveryStatus(result) : 'Idle'}
        </Badge>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-aura-bg/55 ring-1 ring-aura-border/7">
        <div
          className="h-full rounded-full bg-aura-reveal transition-all duration-300"
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Stat label="Elapsed" value={formatDuration(elapsedMs)} />
        <Stat label="Remaining" value={remainingLabel} />
        <Stat label="Files" value={filesProgressLabel} />
      </div>

      {showDelayWarning ? (
        <div className="mt-3 rounded-xl border border-aura-danger/20 bg-aura-danger/8 px-3 py-2 text-sm text-aura-danger">
          Reveal is taking longer than expected. Aura is still finalizing the current recovery pass.
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 rounded-xl border border-aura-danger/20 bg-aura-danger/8 px-3 py-2 text-sm text-aura-danger">
          {error}
        </div>
      ) : null}
    </div>
  )
}

function IdlePanel({ mode }: { mode: RevealSessionState['mode'] }) {
  return (
    <div className="rounded-2xl border border-aura-border/10 bg-aura-surface p-5 shadow-sm">
      <div className="mb-4 flex h-24 items-center justify-center rounded-xl bg-[linear-gradient(90deg,rgba(var(--aura-reveal),0.05),rgba(var(--aura-accent),0.04),rgba(var(--aura-reveal),0.05))] ring-1 ring-aura-border/7">
        <div className="flex h-12 w-44 items-end gap-1">
          {Array.from({ length: 28 }).map((_, index) => (
            <span
              key={index}
              className="flex-1 rounded-full bg-aura-reveal/25"
              style={{ height: `${10 + ((index * 7) % 28)}px` }}
            />
          ))}
        </div>
      </div>
      <div className="font-semibold text-aura-text">AURA Reveal Sequence</div>
      <p className="mt-2 text-sm leading-6 text-aura-muted">
        {mode === 'idle'
          ? 'Select a chat audio item or upload one or more WAV carriers. Aura will decode the 2-byte header, recover payload chunks, and reconstruct the concealed message.'
          : 'Input is ready. Start Reveal to begin the forensic decode sequence.'}
      </p>
    </div>
  )
}

function ResultPanel({
  result,
  recoveredText,
  rawOpen,
  partsOpen,
  changes,
  segments,
  missingSegments,
  onToggleRaw,
  onToggleParts,
}: {
  result: RevealResult
  recoveredText: string
  rawOpen: boolean
  partsOpen: boolean
  changes: DecodeChange[]
  segments: RevealResult['segments']
  missingSegments: number[]
  onToggleRaw: () => void
  onToggleParts: () => void
}) {
  const statusTone = result.success && result.recovery_status !== 'failed' ? 'safe' : 'danger'
  const displayStatus = userFacingRecoveryStatus(result)
  const isMultiIncomplete = result.mode === 'multi' && result.recovery_status !== 'complete'
  const partialPreview = (result.recovered_text || result.corrected_text || result.raw_text || '').trim()
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-aura-border/10 bg-aura-surface p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-aura-muted/60">
            Recovered message
          </div>
          <Badge tone={statusTone}>{displayStatus}</Badge>
        </div>
        {result.mode === 'multi' ? (
          <div className="mb-3 rounded-xl bg-aura-bg/35 px-3 py-2 text-xs text-aura-muted ring-1 ring-aura-border/7">
            Transmission {result.transmission_id || 'unknown'} · {result.received_segments ?? segments.length} of{' '}
            {result.total_segments ?? segments.length} parts received
          </div>
        ) : null}
        {missingSegments.length ? (
          <div className="mb-3 rounded-xl border border-aura-danger/20 bg-aura-danger/8 px-3 py-2 text-sm text-aura-danger">
            Incomplete transmission. Missing {missingSegments.map((segment) => `Part ${segment}`).join(', ')}.
          </div>
        ) : null}
        {isMultiIncomplete ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-aura-danger/20 bg-aura-danger/8 px-4 py-3 text-sm text-aura-danger">
              Transmission incomplete. Recovered {result.received_segments ?? segments.length} of {result.total_segments ?? segments.length} parts.
            </div>
            {partialPreview ? (
              <div className="rounded-xl bg-aura-bg/35 px-4 py-3.5 ring-1 ring-aura-border/8">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-aura-muted/70">
                  Partial reconstruction (incomplete)
                </div>
                <p className="break-words text-sm leading-7 text-aura-text">{partialPreview}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl bg-aura-reveal/8 px-4 py-3.5">
            <p className="break-words text-[22px] font-semibold leading-9 text-aura-text">
              {recoveredText || '(No text recovered)'}
            </p>
          </div>
        )}
        {recoveredText && !isMultiIncomplete ? (
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(recoveredText)}
            className="mt-3 inline-flex items-center rounded-xl border border-aura-border/12 bg-aura-bg/35 px-3 py-2 text-sm font-semibold text-aura-text"
          >
            <Copy size={14} className="mr-2" />
            Copy recovered text
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total chunks" value={result.total_chunks ?? result.total_segments ?? '-'} />
        <Stat label="Payload chunks" value={result.payload_chunks_needed ?? result.received_segments ?? '-'} />
        <Stat label="Ignored tail" value={result.ignored_tail_chunks ?? missingSegments.length} />
        <Stat label="Header valid" value={result.header_valid === undefined ? 'n/a' : result.header_valid ? 'yes' : 'no'} />
      </div>

      <div className="rounded-2xl border border-aura-border/10 bg-aura-surface px-4 py-3.5 shadow-sm">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-aura-muted/60">
          Corrections applied
        </div>
        <p className="break-words text-sm leading-6 text-aura-muted">
          {changes.length
            ? changes.map((change) => `${change.from ?? ''} -> ${change.to ?? ''}`).join(' · ')
            : 'No corrections applied'}
        </p>
      </div>

      {segments.length ? (
        <Collapsible title="Per-part breakdown" open={partsOpen} onToggle={onToggleParts}>
          <div className="space-y-2">
            {segments.map((segment, index) => (
              <div key={`${segment.file_name ?? 'segment'}-${index}`} className="rounded-xl bg-aura-bg/35 px-3 py-2">
                <div className="text-sm font-semibold text-aura-text">
                  Part {(segment.segment_index ?? index) + 1}
                </div>
                <div className="mt-1 text-xs text-aura-muted">{segment.file_name ?? 'unknown file'}</div>
                {segment.decoded_text ? (
                  <div className="mt-2 font-mono text-xs leading-5 text-aura-text">{segment.decoded_text}</div>
                ) : null}
              </div>
            ))}
          </div>
        </Collapsible>
      ) : null}

      {result.raw_text ? (
        <Collapsible title="Raw decoder output" open={rawOpen} onToggle={onToggleRaw}>
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-aura-text">
            {result.raw_text}
          </pre>
        </Collapsible>
      ) : null}
    </div>
  )
}

function Collapsible({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-aura-border/10 bg-aura-surface shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-aura-muted transition-colors hover:text-aura-text"
      >
        {title}
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open ? <div className="border-t border-aura-border/8 px-4 py-3">{children}</div> : null}
    </div>
  )
}

function parseGroupedFileName(fileName: string) {
  const match = fileName.match(/^tx_(.+)_part_(\d+)_of_(\d+)\.wav$/i)
  if (!match) return null
  return {
    transmissionId: match[1],
    segmentIndex: Math.max(0, Number(match[2]) - 1),
    totalSegments: Number(match[3]),
  }
}

function fileToRevealInput(file: File): RevealInputFile {
  const parsed = parseGroupedFileName(file.name)
  return {
    id: `${file.name}-${file.lastModified}-${file.size}`,
    file,
    fileName: file.name,
    source: 'upload',
    transmissionId: parsed?.transmissionId,
    segmentIndex: parsed?.segmentIndex,
    totalSegments: parsed?.totalSegments,
    previewUrl: URL.createObjectURL(file),
    isPlayable: true,
  }
}

function buildSelectedAudioFiles(selectedAudio: SelectedAudio | null): RevealInputFile[] {
  if (!selectedAudio) return []
  const segments = selectedAudio.segments ?? []
  if (segments.length) {
    return segments.map((segment, index) => {
      const parsed = parseGroupedFileName(segment.fileName ?? segment.stego_file_name ?? `part_${index + 1}.wav`)
      return {
        id: `${selectedAudio.transmissionId ?? selectedAudio.messageId}-${index}`,
        fileName: segment.fileName || `part_${index + 1}.wav`,
        audioUrl: segment.audioUrl,
        source: 'chat',
        transmissionId: selectedAudio.transmissionId ?? parsed?.transmissionId,
        segmentIndex: parsed?.segmentIndex ?? segment.segmentIndex,
        totalSegments: parsed?.totalSegments ?? segment.totalSegments ?? selectedAudio.totalSegments,
        durationSec: segment.carrierDurationSec,
        isPlayable: Boolean(segment.audioUrl),
      }
    })
  }
  const parsed = parseGroupedFileName(selectedAudio.fileName)
  return [
    {
      id: selectedAudio.messageId || selectedAudio.fileName,
      fileName: selectedAudio.fileName || 'selected-audio.wav',
      audioUrl: selectedAudio.audioUrl,
      source: 'chat',
      transmissionId: selectedAudio.transmissionId ?? parsed?.transmissionId,
      segmentIndex: parsed?.segmentIndex,
      totalSegments: parsed?.totalSegments ?? selectedAudio.totalSegments,
      isPlayable: Boolean(selectedAudio.audioUrl),
    },
  ]
}

function buildSession(files: RevealInputFile[]): RevealSessionState {
  const safeFiles = files ?? []
  if (!safeFiles.length) {
    return { mode: 'idle', files: [], sorted: false }
  }
  const allIndexed = safeFiles.every((file) => file.segmentIndex !== undefined)
  const transmissionId = safeFiles.find((file) => file.transmissionId)?.transmissionId
  const expectedSegments = safeFiles.find((file) => file.totalSegments)?.totalSegments
  const sortedFiles = allIndexed
    ? [...safeFiles].sort((left, right) => (left.segmentIndex ?? 0) - (right.segmentIndex ?? 0))
    : safeFiles
  return {
    mode: sortedFiles.length > 1 || (expectedSegments ?? 1) > 1 ? 'multi' : 'single',
    files: sortedFiles,
    transmissionId,
    expectedSegments,
    sorted: allIndexed,
  }
}

function normalizeRevealResponse(raw: unknown, session?: RevealSessionState): RevealResult | null {
  if (!raw) return null
  const value = raw as Partial<DecodeResult> & Record<string, unknown>
  const mode = (value.mode === 'multi' || session?.mode === 'multi') ? 'multi' : 'single'
  const segments = Array.isArray(value.segments) ? value.segments : []
  const missingSegments = Array.isArray(value.missing_segments) ? value.missing_segments : []
  const recoveredText = String(value.recovered_text ?? value.corrected_text ?? value.recoveredText ?? value.raw_text ?? '')
  const rawText = String(value.raw_text ?? '')
  const correctedText = String(value.corrected_text ?? recoveredText)
  const changes = Array.isArray(value.changes) ? value.changes : []
  const rawStatus = value.recovery_status as RevealResult['recovery_status'] | undefined
  const totalSegments = value.total_segments ?? segments.length ?? session?.expectedSegments ?? 0
  const receivedSegments = value.received_segments ?? segments.length ?? 0
  const success = Boolean(value.success) && missingSegments.length === 0 && rawStatus !== 'failed'
  const inferredStatus =
    mode === 'multi'
      ? missingSegments.length > 0 || receivedSegments < totalSegments
        ? 'incomplete'
        : success
          ? 'complete'
          : 'failed'
      : success
        ? 'complete'
        : 'failed'
  return {
    success,
    mode,
    transmission_id: String(value.transmission_id ?? session?.transmissionId ?? ''),
    total_segments: Number(totalSegments || 0),
    received_segments: Number(receivedSegments || 0),
    missing_segments: missingSegments,
    recovery_status: rawStatus ?? inferredStatus,
    recovered_text: recoveredText,
    raw_text: rawText,
    corrected_text: correctedText,
    changes,
    total_chunks: numberOrUndefined(value.total_chunks),
    header_chunks: numberOrUndefined(value.header_chunks),
    decoded_message_length: numberOrUndefined(value.decoded_message_length),
    payload_chunks_needed: numberOrUndefined(value.payload_chunks_needed),
    ignored_tail_chunks: numberOrUndefined(value.ignored_tail_chunks),
    header_valid: typeof value.header_valid === 'boolean' ? value.header_valid : undefined,
    segments,
    error: typeof value.error === 'string' ? value.error : undefined,
  }
}

function getRevealPhases(session: RevealSessionState, result: RevealResult | null): Phase[] {
  if (session.mode !== 'multi') return SINGLE_PHASES
  const total = Number(result?.total_segments ?? session.expectedSegments ?? session.files.length ?? 0)
  const received = Number(result?.received_segments ?? result?.segments?.length ?? 0)
  const complete = Boolean(result?.success) && (result?.recovery_status === 'complete' || (total > 0 && received >= total))
  const missing = result?.missing_segments ?? []
  return [
    {
      label: 'Files loaded',
      caption: 'Carrier segments collected for grouped reveal.',
      status: 'preparing grouped input',
    },
    {
      label: 'Sequence validated',
      caption: 'Transmission part numbers checked and sorted.',
      status: 'validating segment sequence...',
    },
    {
      label: 'Parts decoded',
      caption: `${received} of ${total || session.files.length} parts decoded successfully.`,
      status: 'decoding grouped parts...',
    },
    {
      label: 'Message reassembled',
      caption: complete
        ? 'Segment payloads merged in transmission order.'
        : 'Waiting on missing parts before full reassembly.',
      status: 'reassembling recovered text...',
    },
    {
      label: 'Final verification',
      caption: complete
        ? 'Full transmission recovered.'
        : `Transmission incomplete. Missing part(s): ${missing.length ? missing.join(', ') : 'pending'}`,
      status: 'final verification...',
    },
  ]
}

function userFacingRecoveryStatus(result: RevealResult): string {
  if (result.mode === 'multi') {
    if (result.error?.toLowerCase().includes('same aura transmission')) return 'Mixed transmission'
    if (result.error?.toLowerCase().includes('sequence') || result.error?.toLowerCase().includes('duplicate part')) return 'Sequence error'
    if (result.recovery_status === 'complete' && result.success) return 'Complete'
    if (result.recovery_status === 'incomplete' || (result.missing_segments?.length ?? 0) > 0) return 'Incomplete'
    return 'Decode failed'
  }
  if (result.recovery_status === 'failed' || !result.success) return 'Decode failed'
  return 'Complete'
}

function normalizedToDecodeResult(normalized: RevealResult, raw: DecodeResult): DecodeResult {
  return {
    ...raw,
    success: normalized.success,
    mode: normalized.mode,
    transmission_id: normalized.transmission_id,
    total_segments: normalized.total_segments,
    received_segments: normalized.received_segments,
    missing_segments: normalized.missing_segments,
    recovery_status: normalized.recovery_status,
    recovered_text: normalized.recovered_text,
    corrected_text: normalized.corrected_text,
    raw_text: normalized.raw_text,
    changes: normalized.changes,
    segments: normalized.segments as DecodeResult['segments'],
  }
}

function estimateDuration(session: RevealSessionState) {
  const fileCount = Math.max(1, session.files.length)
  const totalDuration = session.files.reduce((sum, file) => sum + (file.durationSec ?? 0), 0)
  const estimate = 2_000 + fileCount * 1_200 + (totalDuration / 600) * 400
  return Math.min(30_000, Math.max(4_000, estimate))
}

function buildInitialPartStates(files: RevealInputFile[], running = false): RevealPartState[] {
  return files.map((file, index) => ({
    id: file.id,
    partNumber: (file.segmentIndex ?? index) + 1,
    fileName: file.fileName,
    status: running ? (index === 0 ? 'active' : 'queued') : 'queued',
  }))
}

function syncRunningPartStates(
  current: RevealPartState[],
  files: RevealInputFile[],
  completedCount: number,
  activeIndex: number,
): RevealPartState[] {
  return files.map((file, index) => {
    const previous = current.find((part) => part.id === file.id)
    if (index < completedCount) {
      return previous?.status === 'completed' || previous?.status === 'completedJustNow'
        ? previous
        : {
            id: file.id,
            partNumber: (file.segmentIndex ?? index) + 1,
            fileName: file.fileName,
            status: 'completedJustNow',
            completedAt: Date.now(),
          }
    }
    if (index === activeIndex) {
      return {
        id: file.id,
        partNumber: (file.segmentIndex ?? index) + 1,
        fileName: file.fileName,
        status: 'active',
      }
    }
    return {
      id: file.id,
      partNumber: (file.segmentIndex ?? index) + 1,
      fileName: file.fileName,
      status: 'queued',
    }
  })
}

function syncCompletedPartStates(
  current: RevealPartState[],
  files: RevealInputFile[],
  result: RevealResult,
): RevealPartState[] {
  const failedParts = new Set((result.missing_segments ?? []).map((part) => Number(part)))
  const decodedParts = new Set(
    (result.segments ?? [])
      .map((segment, index) => (segment.segment_index ?? index) + 1)
      .filter((part) => Number.isFinite(part)),
  )

  return files.map((file, index) => {
    const previous = current.find((part) => part.id === file.id)
    const partNumber = (file.segmentIndex ?? index) + 1
    if (failedParts.has(partNumber)) {
      return {
        id: file.id,
        partNumber,
        fileName: file.fileName,
        status: 'failed',
      }
    }
    if (result.success || decodedParts.has(partNumber)) {
      return previous?.status === 'completed'
        ? previous
        : {
            id: file.id,
            partNumber,
            fileName: file.fileName,
            status: 'completedJustNow',
            completedAt: Date.now(),
          }
    }
    return {
      id: file.id,
      partNumber,
      fileName: file.fileName,
      status: 'queued',
    }
  })
}

function getRemainingLabel({
  status,
  etaSeconds,
  elapsedSeconds: _elapsedSeconds,
  phase,
}: {
  status: RevealRunStatus
  etaSeconds?: number | null
  elapsedSeconds: number
  phase?: string | null
}) {
  if (status === 'completed') return '0s'
  if (status === 'failed') return '—'
  if (status !== 'running') return '—'

  if (typeof etaSeconds === 'number' && etaSeconds > 0.4) {
    return `${Math.ceil(etaSeconds)}s`
  }

  if (phase && /verify|verification|final/i.test(phase)) {
    return 'Finalizing...'
  }

  return 'Estimating...'
}

function getFilesProgressLabel(parts: RevealPartState[], totalFiles: number) {
  const total = totalFiles || parts.length
  if (!total) return '—'
  const processed = parts.filter((part) => part.status === 'completed' || part.status === 'completedJustNow').length
  return `${processed} / ${total}`
}

function getPhaseLabel(status: RevealRunStatus, phase: string | undefined, result: RevealResult | null) {
  if (status === 'completed') return 'Recovery complete'
  if (status === 'failed') return result ? userFacingRecoveryStatus(result) : 'Decode failed'
  if (status === 'running') return phase || 'Processing reveal...'
  return 'Ready'
}

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return minutes ? `${minutes}:${String(remaining).padStart(2, '0')}` : `${remaining}s`
}

function numberOrUndefined(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function revokeObjectUrls(files: RevealInputFile[]) {
  files.forEach((file) => {
    if (file.previewUrl) URL.revokeObjectURL(file.previewUrl)
  })
}
