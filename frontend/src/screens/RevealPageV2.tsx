import { useEffect, useRef, useState } from 'react'
import {
  Upload,
  Wand2,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Badge, Stat } from '../components/AuraPrimitives'
import { decodeByReference, decodeUpload, resolveUrl } from '../services/api'
import type { DecodeResult, SelectedAudio } from '../types'

type Props = {
  selectedAudio: SelectedAudio | null
  decodeResult: DecodeResult | null
  onDecoded: (result: DecodeResult) => void
}

const STEPS = [
  { id: 1, label: 'Carrier loaded', detail: 'Reading WAV container' },
  { id: 2, label: 'Header decoded', detail: 'Parsing 2-byte header' },
  { id: 3, label: 'Payload extracted', detail: 'Recovering protected payload chunks' },
  { id: 4, label: 'Text reconstructed', detail: 'Converting recovered nibbles into text' },
  { id: 5, label: 'Post-processing', detail: 'Final verification and text stabilisation' },
]

const STEP_INTERVAL_MS = 620
const LAST_STEP = STEPS.length
const STEP_PROGRESS = [0, 18, 38, 58, 78, 92]
const STEP_VISUAL_PROGRESS = [0, 28, 50, 68, 84, 96]

function ActivePulseDot() {
  return (
    <div className="relative flex h-5 w-5 items-center justify-center">
      <span className="absolute h-4 w-4 rounded-full bg-aura-reveal/18 animate-ping" />
      <span className="relative h-2.5 w-2.5 rounded-full bg-aura-reveal shadow-[0_0_0_4px_rgba(45,180,170,0.12)]" />
    </div>
  )
}

function WaveProgress({ progress }: { progress: number }) {
  const bars = 64

  // Visual fill should feel fuller than literal math for staged progress
  const visualProgress = Math.min(100, Math.pow(progress / 100, 0.72) * 100)
  const activeBars = Math.max(1, Math.round((visualProgress / 100) * bars))

  const heights = [16, 28, 20, 34, 18, 40, 22, 32, 17, 30, 21, 36]

  return (
    <div className="flex h-12 w-full items-end gap-[2px]">
      {Array.from({ length: bars }).map((_, i) => {
        const height = heights[i % heights.length]
        const active = i < activeBars
        const isLeading = i === activeBars - 1 && progress < 100

        return (
          <div
            key={i}
            className={[
              'min-w-0 flex-1 rounded-full transition-all duration-500 ease-out',
              active ? 'bg-aura-reveal' : 'bg-aura-border/10',
              isLeading ? 'animate-pulse' : '',
            ].join(' ')}
            style={{
              height: `${height}px`,
              opacity: active ? 0.95 : 1,
              transform: isLeading ? 'scaleY(1.06)' : 'scaleY(1)',
            }}
          />
        )
      })}
    </div>
  )
}

export function RevealPageV2({ selectedAudio, decodeResult, onDecoded }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rawOpen, setRawOpen] = useState(false)

  const [timelineStep, setTimelineStep] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function clearTimelineTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function resetTimeline() {
    clearTimelineTimer()
    setTimelineStep(0)
  }

  function startTimeline() {
    clearTimelineTimer()
    setTimelineStep(1)

    timerRef.current = setInterval(() => {
      setTimelineStep((prev) => {
        if (prev >= LAST_STEP) {
          clearTimelineTimer()
          return prev
        }
        return prev + 1
      })
    }, STEP_INTERVAL_MS)
  }

  function completeTimeline() {
    clearTimelineTimer()
    setTimelineStep(LAST_STEP + 1)
  }

  useEffect(() => {
    return () => {
      clearTimelineTimer()
    }
  }, [])

  useEffect(() => {
    if (selectedAudio) {
      setFile(null)
      setError('')
      setRawOpen(false)
      resetTimeline()
    }
  }, [selectedAudio?.messageId])

  async function handleDecode() {
    if (busy) return
    if (!selectedAudio && !file) return

    setBusy(true)
    setError('')
    setRawOpen(false)
    resetTimeline()
    startTimeline()

    try {
      const result = selectedAudio
        ? await decodeByReference(selectedAudio.messageId, selectedAudio.audioUrl)
        : file
          ? await decodeUpload(file)
          : null

      if (result) {
        completeTimeline()
        onDecoded(result)
      } else {
        resetTimeline()
      }
    } catch (err) {
      resetTimeline()
      setError(err instanceof Error ? err.message : 'Decode failed.')
    } finally {
      setBusy(false)
    }
  }

  const showTimeline = timelineStep > 0 || !!decodeResult
  const allDone = timelineStep > LAST_STEP || !!decodeResult

  function stepStatus(id: number): 'done' | 'active' | 'idle' {
    if (allDone) return 'done'
    if (id < timelineStep) return 'done'
    if (id === timelineStep) return 'active'
    return 'idle'
  }

  const currentText =
    decodeResult?.corrected_text?.trim() ||
    decodeResult?.recoveredText?.trim() ||
    decodeResult?.raw_text?.trim() ||
    ''

  const hasDecodeResult = !!decodeResult
  const clampedStep = Math.min(Math.max(timelineStep, 0), LAST_STEP)

const progressPercent = hasDecodeResult
  ? 100
  : busy
    ? STEP_PROGRESS[clampedStep] ?? 8
    : 0

const visualProgressPercent = hasDecodeResult
  ? 100
  : busy
    ? STEP_VISUAL_PROGRESS[clampedStep] ?? 12
    : 0
  const activeStepDetail =
    busy && timelineStep > 0 && timelineStep <= LAST_STEP
      ? STEPS[timelineStep - 1]?.detail ?? 'Processing reveal sequence'
      : 'Preparing reveal sequence'

  const statusTone =
    decodeResult?.recovery_status === 'exact'
      ? 'safe'
      : decodeResult?.recovery_status
        ? 'accent'
        : 'accent'

  const correctionSummary = decodeResult
    ? decodeResult.changes.length > 0
      ? decodeResult.changes.map((c) => `${c.from} → ${c.to}`).join('  ·  ')
      : decodeResult.recovery_status === 'exact'
        ? 'None — exact match'
        : 'None'
    : ''

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="rounded-2xl border border-aura-border/10 bg-aura-surface px-5 py-4 shadow-sm">
        <h1 className="text-[24px] font-semibold tracking-tight text-aura-text">Reveal</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-aura-dim">
          Recover hidden text from an encoded WAV.
        </p>
      </div>

      {/* Selected audio + action bar */}
      <div className="rounded-2xl border border-aura-border/10 bg-aura-surface px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          {/* Left: file identity */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-aura-reveal/10">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-aura-reveal">
                <rect x="1" y="5" width="2" height="6" rx="1" fill="currentColor" opacity=".45" />
                <rect x="4.5" y="3" width="2" height="10" rx="1" fill="currentColor" opacity=".65" />
                <rect x="8" y="1" width="2" height="14" rx="1" fill="currentColor" />
                <rect x="11.5" y="3" width="2" height="10" rx="1" fill="currentColor" opacity=".65" />
              </svg>
            </div>

            <div className="min-w-0 flex-1">
              {selectedAudio ? (
                <>
                  <p className="truncate text-[18px] font-semibold leading-tight text-aura-text">
                    {selectedAudio.fileName}
                  </p>
                  <div className="mt-1.5">
                    <Badge tone="accent">{selectedAudio.source}</Badge>
                  </div>
                </>
              ) : file ? (
                <>
                  <p className="truncate text-[15px] font-medium text-aura-text">{file.name}</p>
                  <p className="mt-1 text-[12px] text-aura-muted">
                    Uploaded stego WAV ready for reveal
                  </p>
                </>
              ) : (
                <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-aura-muted transition-colors hover:text-aura-text">
                  <Upload size={15} className="shrink-0" />
                  Upload stego WAV
                  <input
                    type="file"
                    accept=".wav,audio/wav"
                    className="hidden"
                    onChange={(e) => {
                      setFile(e.target.files?.[0] ?? null)
                      setError('')
                      setRawOpen(false)
                      resetTimeline()
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Middle: audio player */}
          {selectedAudio && (
            <div className="xl:w-auto">
              <audio
                controls
                src={resolveUrl(selectedAudio.audioUrl)}
                className="h-10 w-full min-w-[240px] rounded-xl xl:w-[300px]"
              />
            </div>
          )}

          {/* Right: action */}
          <div className="flex shrink-0 items-center justify-end">
            <button
              type="button"
              disabled={busy || (!selectedAudio && !file)}
              onClick={handleDecode}
              className="inline-flex items-center gap-2 rounded-xl border border-aura-reveal/20 bg-aura-reveal/10 px-4 py-2.5 text-[13px] font-semibold text-aura-reveal transition-all hover:bg-aura-reveal/14 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Wand2 size={15} />
              {busy ? 'Revealing…' : 'Reveal Hidden Message'}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-aura-danger/20 bg-aura-danger/8 px-4 py-3 text-[12px] text-aura-danger">
          {error}
        </div>
      )}

      {/* Main content */}
      <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
        {/* LEFT: Timeline + stats */}
        <div className="rounded-2xl border border-aura-border/10 bg-aura-surface p-4 shadow-sm">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-aura-muted/60">
            Reveal sequence
          </p>

          {showTimeline ? (
            <ol>
              {STEPS.map((step, idx) => {
                const status = stepStatus(step.id)
                const isLast = idx === STEPS.length - 1

                return (
                  <li key={step.id} className="flex gap-2.5">
                    <div className="flex flex-col items-center">
                      <div
                        className={[
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all duration-300',
                          status !== 'idle' ? 'text-aura-reveal' : 'text-aura-border/25',
                        ].join(' ')}
                      >
                        {status === 'done' ? (
                          <CheckCircle2 size={16} strokeWidth={2.5} />
                        ) : status === 'active' ? (
                          <ActivePulseDot />
                        ) : (
                          <Circle size={16} strokeWidth={1.6} />
                        )}
                      </div>

                      {!isLast && (
                        <div
                          className={[
                            'my-1 w-px min-h-[14px] flex-1 transition-colors duration-500',
                            status === 'done' ? 'bg-aura-reveal/35' : 'bg-aura-border/10',
                          ].join(' ')}
                        />
                      )}
                    </div>

                    <div className={isLast ? 'pb-0' : 'pb-2.5'}>
                      <p
                        className={[
                          'text-[14px] font-medium leading-5 transition-colors duration-300',
                          status === 'done'
                            ? 'text-aura-text'
                            : status === 'active'
                              ? 'text-aura-reveal'
                              : 'text-aura-muted/45',
                        ].join(' ')}
                      >
                        {step.label}
                      </p>

                      {status === 'active' && (
                        <p className="mt-0.5 text-[11px] text-aura-muted animate-pulse">
                          {step.detail}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          ) : (
            <div className="rounded-xl border border-aura-border/8 bg-aura-bg/35 px-3.5 py-3.5">
              <p className="text-[13px] leading-6 text-aura-muted">
                Aura reads the 2-byte header, recovers protected payload chunks, reconstructs the concealed text, and then presents the final reveal.
              </p>
            </div>
          )}

          {/* Stats after decode */}
          {hasDecodeResult && (
            <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-aura-border/8 pt-4">
              <Stat label="Total chunks" value={decodeResult.total_chunks} />
              <Stat label="Payload chunks" value={decodeResult.payload_chunks_needed} />
              <Stat label="Ignored tail" value={decodeResult.ignored_tail_chunks} />
              <Stat label="Header valid" value={decodeResult.header_valid ? 'yes' : 'no'} />
            </div>
          )}
        </div>

        {/* RIGHT: Result area */}
        <div className="flex flex-col gap-3.5">
          {/* Recovered message */}
          <div className="rounded-2xl border border-aura-border/10 bg-aura-surface p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-aura-muted/60">
                Recovered message
              </p>

              {hasDecodeResult && (
                <Badge tone={statusTone}>{decodeResult.recovery_status}</Badge>
              )}
            </div>

            {hasDecodeResult ? (
              <div className="rounded-xl bg-aura-reveal/8 px-4 py-3.5">
                <p className="text-[22px] font-semibold leading-9 text-aura-text break-words">
                  {currentText || '(No text recovered)'}
                </p>
              </div>
            ) : busy ? (
              <div className="rounded-xl bg-aura-bg/50 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-medium text-aura-text">
                    Processing reveal sequence…
                  </span>
                  <span className="text-[12px] font-medium text-aura-dim">
                    {progressPercent}%
                  </span>
                </div>

                <div className="mt-3 rounded-xl border border-aura-border/8 bg-aura-bg/35 px-3 py-2.5">
                 <WaveProgress progress={visualProgressPercent} />
                </div>

                <p className="mt-2 text-[12px] text-aura-muted">
                  {activeStepDetail}
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-aura-bg/50 px-4 py-3.5">
                <p className="text-[13px] text-aura-muted">
                  Select an audio message from Chat or upload a WAV, then click Reveal Hidden Message.
                </p>
              </div>
            )}
          </div>

          {/* Corrections */}
          {hasDecodeResult && (
            <div className="rounded-2xl border border-aura-border/10 bg-aura-surface px-4 py-3.5 shadow-sm">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-aura-muted/60">
                Corrections applied
              </p>
              <p className="text-[13px] leading-6 text-aura-muted break-words">
                {correctionSummary}
              </p>
            </div>
          )}

          {/* Raw decoder output */}
          {hasDecodeResult && (
            <div className="overflow-hidden rounded-2xl border border-aura-border/10 bg-aura-surface shadow-sm">
              <button
                type="button"
                onClick={() => setRawOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-[13px] font-semibold text-aura-muted transition-colors hover:text-aura-text"
              >
                Raw decoder output
                {rawOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>

              {rawOpen && (
                <pre className="whitespace-pre-wrap border-t border-aura-border/8 px-4 py-3 font-mono text-[11px] leading-5 text-aura-text">
                  {decodeResult.raw_text}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}