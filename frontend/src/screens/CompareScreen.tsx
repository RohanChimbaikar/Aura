import {
  Activity,
  AudioLines,
  CheckCircle2,
  FileAudio,
  Play,
  Pause,
  ShieldCheck,
  Waves,
  Volume2,
  AlertTriangle,
  Info,
  Sliders,
  RefreshCw
} from 'lucide-react'
import { motion } from 'framer-motion'
import React, { useMemo, useState, useRef, useEffect } from 'react'
import { cn } from '../lib/utils'
import type { AnalysisPayload, SelectedAudio } from '../types'
import { resolveUrl } from '../services/api'
import {
  diffPayloads,
  getChunkInsights,
  pointsToPath,
  formatSnr,
  formatNullableDecimal,
  normalizePercent,
  formatPercentValue,
  ChunkInsight
} from '../components/compare/utils'

interface CompareScreenProps {
  analysis: AnalysisPayload | null
  selectedAudio: SelectedAudio | null
  availableAudio: SelectedAudio[]
  loading: boolean
  error: string
  onSelectAudio: (audio: SelectedAudio) => void
  onAnalyzeAudio: (audio: SelectedAudio, options?: { force?: boolean }) => Promise<void> | void
  theme: string
}

export default function CompareScreen({
  analysis,
  selectedAudio,
  availableAudio,
  loading,
  error,
  onSelectAudio,
  onAnalyzeAudio,
  theme: _theme
}: CompareScreenProps) {
  // Sync Audio Playback
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Hovered Chunk for Map tooltip
  const [hoveredChunk, setHoveredChunk] = useState<ChunkInsight | null>(null)

  // Simulation Controls State
  const [noiseLevel, setNoiseLevel] = useState(0)
  const [clippingLevel, setClippingLevel] = useState(100)
  const [transcodeType, setTranscodeType] = useState<'None' | 'MP3' | 'Opus'>('None')
  const [droppedParts, setDroppedParts] = useState<number[]>([])

  // Verdict panel tab state
  const [activePanelTab, setActivePanelTab] = useState<'global' | 'segment'>('global')

  // Track key of selected audio
  const selectedKey = selectedAudio
    ? `${selectedAudio.messageId || ''}__${selectedAudio.audioUrl || ''}__${selectedAudio.fileName || ''}`
    : ''

  // Reset simulation states when selected session changes
  useEffect(() => {
    if (selectedAudio) {
      const sim = selectedAudio.simulation
      setNoiseLevel(sim?.noiseLevel ?? 0)
      setClippingLevel(sim?.clippingLevel ?? 100)
      setTranscodeType(sim?.transcodeType ?? 'None')
      setDroppedParts(sim?.droppedParts ?? [])
    } else {
      setNoiseLevel(0)
      setClippingLevel(100)
      setTranscodeType('None')
      setDroppedParts([])
    }
    setActivePanelTab('global')
  }, [selectedKey])

  const handleApplySimulation = () => {
    if (!selectedAudio) return
    const simulatedAudio: SelectedAudio = {
      ...selectedAudio,
      simulation: {
        noiseLevel,
        clippingLevel,
        transcodeType,
        droppedParts
      }
    }
    onAnalyzeAudio(simulatedAudio, { force: true })
  }

  const handleResetSimulation = () => {
    if (!selectedAudio) return
    setNoiseLevel(0)
    setClippingLevel(100)
    setTranscodeType('None')
    setDroppedParts([])
    
    const cleanAudio: SelectedAudio = {
      ...selectedAudio,
      simulation: undefined
    }
    onAnalyzeAudio(cleanAudio, { force: true })
  }

  const totalParts = useMemo(() => {
    return selectedAudio?.totalSegments || analysis?.summary?.filesTotal || analysis?.filesTotal || 1
  }, [selectedAudio, analysis])

  // Sync playback state with HTML audio element
  useEffect(() => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.play().catch(() => setIsPlaying(false))
    } else {
      audioRef.current.pause()
    }
  }, [isPlaying])

  // Reset audio playback state when selected audio changes
  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    if (audioRef.current) {
      audioRef.current.load()
    }
  }, [selectedAudio])

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }

  const handleAudioEnded = () => {
    setIsPlaying(false)
    setCurrentTime(0)
  }

  const playbackRatio = duration > 0 ? currentTime / duration : 0

  // Binds session list and handles dropdown change
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

  const handleSessionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const picked = options.find((opt) => opt.key === e.target.value)?.audio
    if (picked) {
      onSelectAudio(picked)
    }
  }

  const handleAnalyzeClick = () => {
    if (selectedAudio) {
      onAnalyzeAudio(selectedAudio, { force: true })
    }
  }

  // Waveform coordinates mapping
  const coverPoints = analysis?.charts.waveformComparison?.coverWaveform || []
  const stegoPoints = analysis?.charts.waveformComparison?.stegoWaveform || []
  const diffPoints =
    analysis?.charts.waveformComparison?.diffWaveform ||
    analysis?.charts.waveformComparison?.differenceWaveform ||
    []

  // Sync cursor seek on waveform click
  const handleWaveformClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!audioRef.current || duration <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickRatio = Math.min(1, Math.max(0, clickX / rect.width))
    audioRef.current.currentTime = clickRatio * duration
    setCurrentTime(clickRatio * duration)
  }

  // Synced hover timeline
  const [hoverRatio, setHoverRatio] = useState<number | null>(null)
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    setHoverRatio(Math.min(1, Math.max(0, x / rect.width)))
  }
  const handlePointerLeave = () => {
    setHoverRatio(null)
  }

  // Chunk insights mapped from chunkTable
  const chunkInsights = useMemo(() => {
    if (!analysis || !analysis.chunkTable) return []
    return getChunkInsights(analysis.chunkTable, analysis.charts.payloadStructure)
  }, [analysis])

  // Payload text recovery calculations
  const expectedText = analysis?.summary.recoveredText || ''
  const recoveredText = analysis?.recovery.corrected_text || analysis?.recovery.raw_text || ''

  // Compute Word Diffs
  const diffTokens = useMemo(() => {
    return diffPayloads(expectedText, recoveredText)
  }, [expectedText, recoveredText])

  // Transmission metadata indicators
  const transmissionMode = analysis?.sourceType || (selectedAudio?.totalSegments && selectedAudio.totalSegments > 1 ? 'grouped' : 'single')
  const integrityScorePercent = analysis ? Math.round((normalizePercent(analysis.summary.integrityScore ?? 0) ?? 0) * 100) : 0

  return (
    <div className="min-h-screen bg-aura-bg text-aura-text transition-colors duration-300">
      <div className="mx-auto max-w-[1800px] p-4 lg:p-8 space-y-8">
        
        {/* Workstation Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-aura-border/15 pb-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-aura-reveal/30 bg-aura-reveal/10 p-3 text-aura-reveal">
              <AudioLines className="h-6 w-6" />
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                Deep forensic inspection mode
              </div>
              <h1 className="mt-1 text-4xl lg:text-5xl font-semibold tracking-[-0.04em]">
                Compare
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
            {selectedAudio && (
              <>
                <div className="rounded-md border border-aura-border/15 bg-aura-surfaceSoft px-2.5 py-1 text-aura-muted">
                  Mode: <span className="text-aura-text uppercase">{transmissionMode}</span>
                </div>
                <div className="rounded-md border border-aura-border/15 bg-aura-surfaceSoft px-2.5 py-1 text-aura-muted">
                  Integrity: <span className={cn(
                    "font-semibold",
                    integrityScorePercent >= 80 ? "text-aura-reveal" :
                    integrityScorePercent >= 50 ? "text-aura-accent" : "text-aura-danger"
                  )}>{integrityScorePercent}%</span>
                </div>
                <div className="rounded-md border border-aura-border/15 bg-aura-surfaceSoft px-2.5 py-1 text-aura-muted">
                  Status: <span className="text-aura-reveal font-semibold uppercase">{analysis?.status || 'unparsed'}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Session Selector Panel */}
        <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/50 p-5 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <FileAudio className="h-5 w-5 text-aura-reveal" />
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                  Session selection
                </div>
                <div className="mt-1 text-lg font-semibold">
                  Select Aura Session
                </div>
              </div>
            </div>
            {selectedAudio && !loading && !analysis && (
              <button
                onClick={handleAnalyzeClick}
                className="rounded-lg bg-aura-reveal hover:bg-aura-reveal/90 px-4 py-2 font-mono text-xs font-semibold text-aura-bg transition-colors shadow-md"
              >
                Run Diagnostics
              </button>
            )}
          </div>

          <select
            value={selectedKey}
            onChange={handleSessionChange}
            className="w-full rounded-xl border border-aura-border/15 bg-aura-bg px-4 py-3 text-aura-text outline-none focus:border-aura-reveal/50 transition-colors cursor-pointer text-sm"
          >
            <option value="" disabled>-- Choose a session --</option>
            {options.map((item) => (
              <option key={item.key} value={item.key}>
                {item.audio.fileName || `Session ${item.audio.messageId}`} ({item.audio.source})
              </option>
            ))}
          </select>
        </div>

        {/* Simulation Controls Panel */}
        {selectedAudio && (
          <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/50 p-5 backdrop-blur-sm shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Sliders className="h-5 w-5 text-aura-accent" />
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                    Interactive channel degradation
                  </div>
                  <div className="mt-1 text-lg font-semibold flex items-center gap-2">
                    Channel Simulator
                    {selectedAudio.simulation && (
                      <span className="rounded-full bg-aura-accent/15 border border-aura-accent/30 text-aura-accent px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider font-semibold">
                        Sim Active
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {/* Noise Level Slider */}
              <div className="space-y-2">
                <div className="flex justify-between font-mono text-[11px] text-aura-muted">
                  <span>Additive White Noise</span>
                  <span className="text-aura-accent font-semibold">{noiseLevel}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={noiseLevel}
                  onChange={(e) => setNoiseLevel(Number(e.target.value))}
                  className="w-full h-1 bg-aura-bg border border-aura-border/10 appearance-none cursor-pointer accent-aura-accent rounded"
                />
                <div className="flex justify-between text-[9px] font-mono text-aura-dim">
                  <span>0% (Clean)</span>
                  <span>100% (High Noise)</span>
                </div>
              </div>

              {/* Clipping Saturation Slider */}
              <div className="space-y-2">
                <div className="flex justify-between font-mono text-[11px] text-aura-muted">
                  <span>Clipping Saturation</span>
                  <span className="text-aura-accent font-semibold">{100 - clippingLevel}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={clippingLevel}
                  onChange={(e) => setClippingLevel(Number(e.target.value))}
                  className="w-full h-1 bg-aura-bg border border-aura-border/10 appearance-none cursor-pointer accent-aura-accent rounded"
                />
                <div className="flex justify-between text-[9px] font-mono text-aura-dim">
                  <span>0% (No Clip)</span>
                  <span>90% (Max Clip)</span>
                </div>
              </div>

              {/* Transcode Type Dropdown */}
              <div className="space-y-2">
                <label className="block font-mono text-[11px] text-aura-muted">
                  Transcoding Channel
                </label>
                <select
                  value={transcodeType}
                  onChange={(e) => setTranscodeType(e.target.value as any)}
                  className="w-full rounded-lg border border-aura-border/15 bg-aura-bg px-3 py-1.5 text-aura-text outline-none text-xs font-mono"
                >
                  <option value="None">None (Uncompressed)</option>
                  <option value="MP3">MP3 Simulation (16kHz, 12-bit)</option>
                  <option value="Opus">Opus Simulation (12kHz, 12-bit)</option>
                </select>
              </div>

              {/* Dropped Parts Checklist */}
              <div className="space-y-2">
                <label className="block font-mono text-[11px] text-aura-muted">
                  Simulated Packet Drop
                </label>
                <div className="flex flex-wrap gap-2 max-h-[80px] overflow-y-auto border border-aura-border/10 bg-aura-bg/30 p-2 rounded-lg">
                  {Array.from({ length: totalParts }).map((_, i) => {
                    const partNum = i + 1
                    const isDropped = droppedParts.includes(partNum)
                    return (
                      <button
                        key={partNum}
                        type="button"
                        onClick={() => {
                          if (isDropped) {
                            setDroppedParts(droppedParts.filter((p) => p !== partNum))
                          } else {
                            setDroppedParts([...droppedParts, partNum])
                          }
                        }}
                        className={cn(
                          "px-2.5 py-1 rounded text-[10px] font-mono border transition-all",
                          isDropped
                            ? "bg-aura-danger/15 border-aura-danger/30 text-aura-danger font-semibold"
                            : "bg-aura-surfaceSoft border-aura-border/10 text-aura-muted hover:border-aura-border/30"
                        )}
                      >
                        Part {partNum}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3 border-t border-aura-border/10 pt-4">
              <button
                type="button"
                onClick={handleResetSimulation}
                className="flex items-center gap-1.5 rounded-lg border border-aura-border/15 bg-aura-surfaceSoft hover:bg-aura-surface px-4 py-2 font-mono text-xs text-aura-muted transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Clear Simulation
              </button>
              <button
                type="button"
                onClick={handleApplySimulation}
                className="flex items-center gap-1.5 rounded-lg bg-aura-accent hover:bg-aura-accent/90 px-4 py-2 font-mono text-xs font-semibold text-aura-bg transition-colors shadow-md animate-pulse"
              >
                Apply Channel degradation
              </button>
            </div>
          </div>
        )}

        {/* Global Loading & Error Handlers */}
        {loading ? (
          <div className="space-y-6">
            {/* Metric Skeletons */}
            <div className="grid gap-5 grid-cols-2 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-2xl border border-aura-border/10 bg-aura-surface/40 p-5 h-24" />
              ))}
            </div>
            {/* Waveform Skeletons */}
            <div className="animate-pulse rounded-2xl border border-aura-border/10 bg-aura-surface/40 p-6 h-64" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-aura-danger/20 bg-aura-danger/5 p-6 flex flex-col items-center text-center gap-4">
            <AlertTriangle className="h-10 w-10 text-aura-danger animate-bounce" />
            <div>
              <h3 className="text-lg font-semibold text-aura-danger">Analysis Failed</h3>
              <p className="mt-1 text-sm text-aura-muted max-w-lg">{error}</p>
            </div>
            {selectedAudio && (
              <button
                onClick={handleAnalyzeClick}
                className="rounded-lg bg-aura-danger text-white px-5 py-2 font-mono text-xs font-semibold hover:bg-aura-danger/90 transition-colors"
              >
                Retry Analysis
              </button>
            )}
          </div>
        ) : !selectedAudio ? (
          <div className="rounded-2xl border border-aura-border/12 bg-aura-surface/30 p-12 text-center flex flex-col items-center justify-center gap-4">
            <Info className="h-12 w-12 text-aura-dim" />
            <div>
              <h3 className="text-xl font-semibold">No session selected</h3>
              <p className="mt-2 text-sm text-aura-muted max-w-md">
                Select an active stego speech carrier from the selector above to compare original cover and stego audio channels.
              </p>
            </div>
          </div>
        ) : !analysis ? (
          <div className="rounded-2xl border border-aura-border/12 bg-aura-surface/30 p-12 text-center flex flex-col items-center justify-center gap-4">
            <AlertTriangle className="h-12 w-12 text-aura-dim" />
            <div>
              <h3 className="text-xl font-semibold">No Analysis Result Available</h3>
              <p className="mt-2 text-sm text-aura-muted max-w-md">
                Diagnostics have not been compiled for this session yet. Run the analysis engine to inspect forensics.
              </p>
              <button
                onClick={handleAnalyzeClick}
                className="mt-6 rounded-lg bg-aura-reveal text-aura-bg px-6 py-2.5 font-mono text-xs font-semibold hover:bg-aura-reveal/90 transition-all shadow-lg"
              >
                Run Forensics
              </button>
            </div>
          </div>
        ) : (
          /* WORKSTATION CONTENT STAGE */
          <div className="space-y-8 animate-fadeIn">
            
            {/* Audio Ref for Waveform Sync */}
            {selectedAudio.audioUrl && (
              <audio
                ref={audioRef}
                src={resolveUrl(selectedAudio.audioUrl)}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleAudioEnded}
              />
            )}

            {/* Summary Metrics */}
            <div className="grid gap-5 grid-cols-2 lg:grid-cols-5">
              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-5 shadow-sm">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                  Signal SNR
                </div>
                <div className="mt-3 text-2xl lg:text-3xl font-semibold text-aura-text">
                  {formatSnr(analysis.summary.overallSnrDb)}
                </div>
              </div>

              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-5 shadow-sm">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                  Recovery Confidence
                </div>
                <div className="mt-3 text-2xl lg:text-3xl font-semibold text-aura-text">
                  {formatPercentValue(normalizePercent(analysis.summary.recoveryConfidence))}
                </div>
              </div>

              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-5 shadow-sm">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                  Payload Chunks
                </div>
                <div className="mt-3 text-2xl lg:text-3xl font-semibold text-aura-text">
                  {analysis.summary.payloadChunks || chunkInsights.length}
                </div>
              </div>

              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-5 shadow-sm">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                  ECC Corrections
                </div>
                <div className="mt-3 text-2xl lg:text-3xl font-semibold text-aura-text">
                  {analysis.summary.correctionsCount ?? 0}
                </div>
              </div>

              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-5 shadow-sm col-span-2 lg:col-span-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                  Integrity Score
                </div>
                <div className="mt-3 text-2xl lg:text-3xl font-semibold text-aura-text">
                  {integrityScorePercent}%
                </div>
              </div>
            </div>

            {/* Transmission Reassembly Grid */}
            {analysis && analysis.segments && analysis.segments.length > 0 && (
              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-6 shadow-sm">
                <div className="mb-6">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                    Multi-part Covert Stream
                  </div>
                  <div className="mt-1 text-xl font-semibold flex items-center justify-between gap-4">
                    <span>Packet Reassembly Grid</span>
                    <span className="text-xs font-mono text-aura-muted">
                      Reassembled {analysis.summary.filesProcessed} of {analysis.summary.filesTotal} parts
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {analysis.segments.map((segment) => {
                    const isSelected = (analysis.selectedPartNumber === segment.segment_index + 1) || (!analysis.selectedPartNumber && segment.segment_index === 0)
                    const isParity = segment.metrics?.codecHint === 255
                    const status = segment.status

                    return (
                      <div
                        key={segment.segment_index}
                        onClick={() => {
                          if (segment.status !== 'missing' && selectedAudio) {
                            onAnalyzeAudio({
                              ...selectedAudio,
                              selectedPartNumber: segment.segment_index + 1,
                              selectedPartFilename: segment.file_name,
                            }, { force: true })
                          }
                        }}
                        className={cn(
                          "rounded-xl border p-4 transition-all cursor-pointer select-none",
                          isSelected
                            ? "border-aura-reveal bg-aura-surface/90 shadow-md ring-1 ring-aura-reveal/30"
                            : "border-aura-border/10 bg-aura-surface/40 hover:border-aura-border/30 hover:bg-aura-surface/60",
                          status === 'missing' && "opacity-60 border-dashed cursor-not-allowed"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <div className="font-mono text-[10px] text-aura-dim">
                              PART {String(segment.segment_index + 1).padStart(2, '0')}
                            </div>
                            <div className="text-xs font-semibold font-mono truncate max-w-[150px] text-aura-text mt-0.5" title={segment.file_name}>
                              {segment.file_name.replace(`tx_${analysis.transmissionId}_`, '')}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={cn(
                              "rounded px-1.5 py-0.5 text-[9px] font-mono uppercase font-semibold",
                              status === 'decoded' && "bg-aura-reveal/10 text-aura-reveal border border-aura-reveal/20",
                              status === 'reconstructed' && "bg-aura-accent/10 text-aura-accent border border-aura-accent/20",
                              status === 'missing' && "bg-aura-warning/10 text-aura-warning border border-aura-warning/20",
                              status === 'failed' && "bg-aura-danger/10 text-aura-danger border border-aura-danger/20"
                            )}>
                              {status}
                            </span>
                            {isParity && (
                              <span className="bg-aura-muted/15 text-aura-muted border border-aura-border/20 rounded px-1.5 py-0.5 text-[8px] font-mono font-semibold uppercase">
                                Parity
                              </span>
                            )}
                          </div>
                        </div>

                        {segment.metrics ? (
                          <div className="space-y-1.5 font-mono text-[10px] text-aura-muted border-t border-aura-border/5 pt-2">
                            <div className="flex justify-between">
                              <span>Sync Lock:</span>
                              <span className="text-aura-text font-semibold truncate max-w-[100px]">{segment.metrics.syncLock || 'None'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Sync BER:</span>
                              <span className="text-aura-text">
                                {segment.metrics.syncBer !== null && segment.metrics.syncBer !== undefined
                                  ? `${(segment.metrics.syncBer * 100).toFixed(2)}%`
                                  : 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>ECC Scheme:</span>
                              <span className="text-aura-text">{segment.metrics.eccScheme === 1 ? 'Hamming(8,4)' : 'None'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Corrected Bits:</span>
                              <span className="text-aura-text font-semibold">{segment.metrics.correctedBits ?? 0}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Uncorrectable:</span>
                              <span className={cn("font-semibold", (segment.metrics.uncorrectableCount ?? 0) > 0 ? "text-aura-danger" : "text-aura-muted")}>
                                {segment.metrics.uncorrectableCount ?? 0}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>CRC16 Check:</span>
                              <span className={cn("font-semibold", segment.metrics.payloadCrcOk ? "text-aura-reveal" : "text-aura-danger")}>
                                {segment.metrics.payloadCrcOk ? 'Pass' : 'Fail'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="h-[90px] flex items-center justify-center font-mono text-[10px] text-aura-dim italic border-t border-aura-border/5 pt-2">
                            {status === 'missing' ? 'Part drop simulation applied.' : 'Metrics unavailable.'}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Waveform Comparison Section */}
            <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-6 shadow-sm">
              <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AudioLines className="h-5 w-5 text-aura-reveal" />
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                      Waveform Deviation Analysis
                    </div>
                    <div className="mt-1 text-xl font-semibold">
                      Cover vs Stego Signals
                    </div>
                  </div>
                </div>

                {/* Styled DAW Audio Bar */}
                {selectedAudio.audioUrl && (
                  <div className="flex items-center gap-3 border border-aura-border/15 rounded-xl bg-aura-bg/50 px-4 py-2 font-mono text-xs">
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="rounded-full bg-aura-reveal text-aura-bg p-1.5 hover:scale-105 active:scale-95 transition-transform"
                    >
                      {isPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                    </button>
                    <Volume2 className="h-4 w-4 text-aura-muted" />
                    <span className="text-aura-muted font-mono min-w-[70px]">
                      {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}
                      <span className="text-aura-dim"> / </span>
                      {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
                    </span>
                  </div>
                )}
              </div>

              {/* Synchronized Waveform Strips */}
              <div className="space-y-6">
                <div>
                  <div className="mb-1.5 flex justify-between font-mono text-[10px] uppercase tracking-wider text-aura-dim">
                    <span>Original Cover</span>
                    <span className="text-aura-reveal">Synced</span>
                  </div>
                  <div className="relative h-24 w-full bg-aura-bg/40 border border-aura-border/10 rounded-xl overflow-hidden cursor-pointer hover:border-aura-reveal/30 transition-colors">
                    {coverPoints.length ? (
                      <svg
                        viewBox="0 0 800 100"
                        preserveAspectRatio="none"
                        className="h-full w-full"
                        onClick={handleWaveformClick}
                        onPointerMove={handlePointerMove}
                        onPointerLeave={handlePointerLeave}
                      >
                        <path
                          d={pointsToPath(coverPoints, 800, 50, 42)}
                          fill="none"
                          stroke="rgb(var(--aura-reveal))"
                          strokeWidth={1.5}
                        />
                        {/* Playback Playhead line */}
                        {playbackRatio > 0 && (
                          <line
                            x1={playbackRatio * 800}
                            x2={playbackRatio * 800}
                            y1={0}
                            y2={100}
                            stroke="rgb(var(--aura-text))"
                            strokeWidth={1.8}
                          />
                        )}
                        {/* Seek preview timeline */}
                        {hoverRatio !== null && (
                          <line
                            x1={hoverRatio * 800}
                            x2={hoverRatio * 800}
                            y1={0}
                            y2={100}
                            stroke="rgb(var(--aura-text) / 0.3)"
                            strokeWidth={1}
                            strokeDasharray="4 4"
                          />
                        )}
                      </svg>
                    ) : (
                      <div className="flex h-full items-center justify-center font-mono text-xs text-aura-dim">
                        Cover waveform samples not emitted
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex justify-between font-mono text-[10px] uppercase tracking-wider text-aura-dim">
                    <span>Generated Stego</span>
                    <span className="text-aura-accent">Synced</span>
                  </div>
                  <div className="relative h-24 w-full bg-aura-bg/40 border border-aura-border/10 rounded-xl overflow-hidden cursor-pointer hover:border-aura-reveal/30 transition-colors">
                    {stegoPoints.length ? (
                      <svg
                        viewBox="0 0 800 100"
                        preserveAspectRatio="none"
                        className="h-full w-full"
                        onClick={handleWaveformClick}
                        onPointerMove={handlePointerMove}
                        onPointerLeave={handlePointerLeave}
                      >
                        <path
                          d={pointsToPath(stegoPoints, 800, 50, 42)}
                          fill="none"
                          stroke="rgb(var(--aura-accent))"
                          strokeWidth={1.5}
                        />
                        {/* Playhead */}
                        {playbackRatio > 0 && (
                          <line
                            x1={playbackRatio * 800}
                            x2={playbackRatio * 800}
                            y1={0}
                            y2={100}
                            stroke="rgb(var(--aura-text))"
                            strokeWidth={1.8}
                          />
                        )}
                        {/* Seek preview */}
                        {hoverRatio !== null && (
                          <line
                            x1={hoverRatio * 800}
                            x2={hoverRatio * 800}
                            y1={0}
                            y2={100}
                            stroke="rgb(var(--aura-text) / 0.3)"
                            strokeWidth={1}
                            strokeDasharray="4 4"
                          />
                        )}
                      </svg>
                    ) : (
                      <div className="flex h-full items-center justify-center font-mono text-xs text-aura-dim">
                        Stego waveform samples not emitted
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex justify-between font-mono text-[10px] uppercase tracking-wider text-aura-dim">
                    <span>Residual Difference / Delta</span>
                    <span className="text-aura-danger">Synced</span>
                  </div>
                  <div className="relative h-24 w-full bg-aura-bg/40 border border-aura-border/10 rounded-xl overflow-hidden cursor-pointer hover:border-aura-reveal/30 transition-colors">
                    {diffPoints.length ? (
                      <svg
                        viewBox="0 0 800 100"
                        preserveAspectRatio="none"
                        className="h-full w-full"
                        onClick={handleWaveformClick}
                        onPointerMove={handlePointerMove}
                        onPointerLeave={handlePointerLeave}
                      >
                        <path
                          d={pointsToPath(diffPoints, 800, 50, 42)}
                          fill="none"
                          stroke="rgb(var(--aura-danger))"
                          strokeWidth={1.5}
                        />
                        {/* Playhead */}
                        {playbackRatio > 0 && (
                          <line
                            x1={playbackRatio * 800}
                            x2={playbackRatio * 800}
                            y1={0}
                            y2={100}
                            stroke="rgb(var(--aura-text))"
                            strokeWidth={1.8}
                          />
                        )}
                        {/* Seek preview */}
                        {hoverRatio !== null && (
                          <line
                            x1={hoverRatio * 800}
                            x2={hoverRatio * 800}
                            y1={0}
                            y2={100}
                            stroke="rgb(var(--aura-text) / 0.3)"
                            strokeWidth={1}
                            strokeDasharray="4 4"
                          />
                        )}
                      </svg>
                    ) : (
                      <div className="flex h-full items-center justify-center font-mono text-xs text-aura-dim">
                        Residual difference waveform samples not emitted
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Spectrogram Comparison Section */}
            <div className="grid gap-6 xl:grid-cols-3">
              {/* Cover Spectrogram */}
              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-5 shadow-sm flex flex-col">
                <div className="mb-4 flex items-center gap-3">
                  <Waves className="h-5 w-5 text-aura-reveal" />
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                      Spectrogram analysis
                    </div>
                    <div className="mt-1 text-lg font-semibold">
                      Cover Spectrogram
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center rounded-xl border border-aura-border/10 bg-aura-bg/40 p-2 overflow-hidden aspect-[16/9]">
                  {analysis.charts.compareSpectrogram?.coverImageUrl ? (
                    <img
                      src={resolveUrl(analysis.charts.compareSpectrogram.coverImageUrl)}
                      alt="Cover Spectrogram"
                      className="h-full w-full object-cover rounded-lg"
                    />
                  ) : (
                    <div className="font-mono text-xs text-aura-dim">Image unavailable</div>
                  )}
                </div>
              </div>

              {/* Stego Spectrogram */}
              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-5 shadow-sm flex flex-col">
                <div className="mb-4 flex items-center gap-3">
                  <Waves className="h-5 w-5 text-aura-accent" />
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                      Spectrogram analysis
                    </div>
                    <div className="mt-1 text-lg font-semibold">
                      Stego Spectrogram
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center rounded-xl border border-aura-border/10 bg-aura-bg/40 p-2 overflow-hidden aspect-[16/9]">
                  {analysis.charts.compareSpectrogram?.stegoImageUrl ? (
                    <img
                      src={resolveUrl(analysis.charts.compareSpectrogram.stegoImageUrl)}
                      alt="Stego Spectrogram"
                      className="h-full w-full object-cover rounded-lg"
                    />
                  ) : (
                    <div className="font-mono text-xs text-aura-dim">Image unavailable</div>
                  )}
                </div>
              </div>

              {/* Residual Spectrogram */}
              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-5 shadow-sm flex flex-col">
                <div className="mb-4 flex items-center gap-3">
                  <Waves className="h-5 w-5 text-aura-danger" />
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                      Spectrogram analysis
                    </div>
                    <div className="mt-1 text-lg font-semibold">
                      Residual Difference Map
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center rounded-xl border border-aura-border/10 bg-aura-bg/40 p-2 overflow-hidden aspect-[16/9]">
                  {analysis.charts.compareSpectrogram?.diffImageUrl ? (
                    <img
                      src={resolveUrl(analysis.charts.compareSpectrogram.diffImageUrl)}
                      alt="Residual Difference Map"
                      className="h-full w-full object-cover rounded-lg"
                    />
                  ) : (
                    <div className="font-mono text-xs text-aura-dim">Image unavailable</div>
                  )}
                </div>
              </div>
            </div>

            {/* Payload Recovery Comparison (Word Diffs) */}
            <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-6 shadow-sm">
              <div className="mb-6 flex items-center gap-3 border-b border-aura-border/10 pb-4">
                <ShieldCheck className="h-5 w-5 text-aura-reveal" />
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                    Payload reconstruction
                  </div>
                  <div className="mt-1 text-2xl font-semibold">
                    Recovery Diff Inspector
                  </div>
                </div>
              </div>

              {/* Expected vs Recovered Unified Diff */}
              <div className="mb-6">
                <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-aura-muted">
                  Unified Reconstruction Diff
                </div>
                <div className="rounded-xl border border-aura-border/10 bg-aura-bg/50 p-4 font-mono text-sm leading-7 text-aura-text min-h-[80px]">
                  {diffTokens.length > 0 ? (
                    diffTokens.map((token, index) => {
                      if (token.type === 'match') {
                        return <span key={index}>{token.value}</span>
                      } else if (token.type === 'insert') {
                        return (
                          <span
                            key={index}
                            className="bg-aura-accent/12 text-aura-accent border border-dashed border-aura-accent/30 px-1 rounded mx-0.5"
                            title="Inserted/Modified word in recovered payload"
                          >
                            {token.value}
                          </span>
                        )
                      } else {
                        return (
                          <span
                            key={index}
                            className="bg-aura-danger/12 text-aura-danger border border-dashed border-aura-danger/30 px-1 rounded mx-0.5 line-through decoration-aura-danger/70"
                            title="Missing word in recovered payload"
                          >
                            {token.value}
                          </span>
                        )
                      }
                    })
                  ) : (
                    <span className="text-aura-dim italic">No payload recovery data reported.</span>
                  )}
                </div>
              </div>

              {/* Expected & Recovered Raw Monospaced Panels */}
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-aura-reveal">
                    Expected Payload
                  </div>
                  <div className="rounded-xl border border-aura-reveal/20 bg-aura-surface p-4 font-mono text-[13px] leading-6 text-aura-text min-h-[120px] max-h-[250px] overflow-y-auto">
                    {expectedText || <span className="opacity-40 italic">None</span>}
                  </div>
                </div>

                <div>
                  <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-aura-accent">
                    Recovered Payload
                  </div>
                  <div className="rounded-xl border border-aura-accent/20 bg-aura-surface p-4 font-mono text-[13px] leading-6 text-aura-text min-h-[120px] max-h-[250px] overflow-y-auto">
                    {recoveredText || <span className="opacity-40 italic">None</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Chunk Map + Verdict Section */}
            <div className="grid gap-6 xl:grid-cols-[1.5fr_0.8fr]">
              
              {/* Chunk Integrity Map */}
              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-5 shadow-sm flex flex-col">
                <div className="mb-5 flex items-center gap-3">
                  <Activity className="h-5 w-5 text-aura-reveal" />
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                      Chunk Diagnostics
                    </div>
                    <div className="mt-1 text-xl font-semibold">
                      Forensic Integrity Map
                    </div>
                  </div>
                </div>

                {chunkInsights.length > 0 ? (
                  <div className="flex-1 flex flex-col justify-between gap-6">
                    {/* Diagnostic Grid */}
                    <div className="grid grid-cols-10 sm:grid-cols-12 md:grid-cols-16 lg:grid-cols-20 gap-1.5">
                      {chunkInsights.map((insight) => {
                        const tone = insight.tone
                        return (
                          <motion.div
                            key={insight.row.chunkIndex}
                            onMouseEnter={() => setHoveredChunk(insight)}
                            onMouseLeave={() => setHoveredChunk(null)}
                            whileHover={{ scale: 1.15 }}
                            className={cn(
                              'aspect-square rounded-md border transition-all cursor-crosshair',
                              tone === 'safe' && 'bg-aura-reveal/20 border-aura-reveal/30 text-aura-reveal',
                              tone === 'warning' && 'bg-aura-accent/20 border-aura-accent/30 text-aura-accent',
                              tone === 'danger' && 'bg-aura-danger/20 border-aura-danger/30 text-aura-danger',
                              tone === 'neutral' && 'bg-aura-border/10 border-aura-border/15 text-aura-dim'
                            )}
                          />
                        )
                      })}
                    </div>

                    {/* Interactive Hover Detail Box */}
                    <div className="rounded-xl border border-aura-border/10 bg-aura-bg/30 p-3 h-28 flex flex-col justify-center font-mono text-[11px] text-aura-muted">
                      {hoveredChunk ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                          <div>
                            <span className="text-aura-dim">Chunk:</span> <span className="text-aura-text font-semibold">#{hoveredChunk.row.chunkIndex}</span>
                          </div>
                          <div>
                            <span className="text-aura-dim">SNR:</span> <span className="text-aura-text">{formatSnr(hoveredChunk.row.snrDb)}</span>
                          </div>
                          <div>
                            <span className="text-aura-dim">MSE:</span> <span className="text-aura-text">{formatNullableDecimal(hoveredChunk.row.mse, 6)}</span>
                          </div>
                          <div>
                            <span className="text-aura-dim">Role:</span> <span className="text-aura-text uppercase">{hoveredChunk.role}</span>
                          </div>
                          <div>
                            <span className="text-aura-dim">Confidence:</span> <span className="text-aura-text">{formatPercentValue(hoveredChunk.confidence)}</span>
                          </div>
                          <div>
                            <span className="text-aura-dim">Agreement:</span> <span className="text-aura-text">{formatPercentValue(hoveredChunk.bitAccuracy)}</span>
                          </div>
                          <div>
                            <span className="text-aura-dim">Corruption:</span> <span className="text-aura-text">{formatPercentValue(hoveredChunk.corruption)}</span>
                          </div>
                          <div>
                            <span className="text-aura-dim">ECC Applied:</span> <span className="text-aura-text font-semibold">{hoveredChunk.row.correctionApplied ? 'Yes' : 'No'} ({hoveredChunk.row.correctionCount})</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center text-aura-dim italic py-4">
                          Hover over any diagnostic block in the grid to inspect live signal and bit characteristics.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-aura-border/12 bg-aura-bg/20 p-8 text-center text-sm text-aura-dim font-mono">
                    Chunk diagnostic details not emitted for this session.
                  </div>
                )}
              </div>

              {/* Verdict & Forensic Board Panel */}
              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="mb-4 flex items-center justify-between border-b border-aura-border/10 pb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-aura-reveal" />
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-aura-dim">
                          Forensic analysis board
                        </div>
                        <div className="text-sm font-semibold font-mono">
                          {activePanelTab === 'global' ? 'Global Stream' : `Part ${(analysis.selectedPartNumber || 1)} Metrics`}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex border border-aura-border/15 rounded bg-aura-bg/50 p-0.5 font-mono text-[10px]">
                      <button
                        onClick={() => setActivePanelTab('global')}
                        className={cn(
                          "px-2 py-0.5 rounded transition-all",
                          activePanelTab === 'global' ? "bg-aura-reveal text-aura-bg font-semibold" : "text-aura-muted hover:text-aura-text"
                        )}
                      >
                        Global
                      </button>
                      <button
                        onClick={() => setActivePanelTab('segment')}
                        className={cn(
                          "px-2 py-0.5 rounded transition-all",
                          activePanelTab === 'segment' ? "bg-aura-reveal text-aura-bg font-semibold" : "text-aura-muted hover:text-aura-text"
                        )}
                      >
                        Segment
                      </button>
                    </div>
                  </div>

                  {activePanelTab === 'global' ? (
                    <div className="space-y-3.5 my-4">
                      <div className="flex items-center justify-between rounded-xl border border-aura-border/10 bg-aura-bg/40 px-4 py-2.5 text-xs font-mono">
                        <span className="text-aura-muted">Payload Reassembly</span>
                        <span className={cn(
                          "font-semibold uppercase",
                          analysis.summary.recoveryStatus === 'complete' || analysis.summary.recoveryStatus === 'verified'
                            ? "text-aura-reveal"
                            : "text-aura-accent"
                        )}>
                          {analysis.summary.recoveryStatus?.replace(/_/g, ' ') || 'unverified'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-aura-border/10 bg-aura-bg/40 px-4 py-2.5 text-xs font-mono">
                        <span className="text-aura-muted">Total Segments Resolved</span>
                        <span className="text-aura-text font-semibold">
                          {analysis.summary.filesProcessed} / {analysis.summary.filesTotal}
                        </span>
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-aura-border/10 bg-aura-bg/40 px-4 py-2.5 text-xs font-mono">
                        <span className="text-aura-muted">ECC Corrections Applied</span>
                        <span className="text-aura-text font-semibold">
                          {analysis.summary.correctionsApplied ? 'Active' : 'Bypassed'} ({analysis.summary.correctionsCount ?? 0} total)
                        </span>
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-aura-border/10 bg-aura-bg/40 px-4 py-2.5 text-xs font-mono">
                        <span className="text-aura-muted">Global Distortion Level</span>
                        <span className={cn(
                          "font-semibold",
                          (analysis.summary.overallSnrDb ?? 0) >= 20 ? "text-aura-reveal" :
                          (analysis.summary.overallSnrDb ?? 0) >= 10 ? "text-aura-accent" : "text-aura-danger"
                        )}>
                          {formatSnr(analysis.summary.overallSnrDb)} ({(analysis.summary.overallSnrDb ?? 0) >= 20 ? 'Minimal' :
                           (analysis.summary.overallSnrDb ?? 0) >= 10 ? 'Moderate' : 'High'})
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3.5 my-4">
                      {(() => {
                        const activeSegIdx = (analysis.selectedPartNumber || 1) - 1
                        const activeSegObj = analysis.segments?.find(s => s.segment_index === activeSegIdx)
                        
                        if (activeSegObj) {
                          return (
                            <>
                              <div className="text-[11px] font-mono text-aura-dim truncate border-b border-aura-border/5 pb-1.5 mb-2">
                                File: {activeSegObj.file_name}
                              </div>
                              
                              <div className="flex items-center justify-between rounded-xl border border-aura-border/10 bg-aura-bg/40 px-4 py-2 text-xs font-mono">
                                <span className="text-aura-muted">Sync Lock Status</span>
                                <span className="text-aura-text font-semibold truncate max-w-[140px]" title={activeSegObj.metrics?.syncLock || 'None'}>
                                  {activeSegObj.metrics?.syncLock || 'None'}
                                </span>
                              </div>

                              <div className="flex items-center justify-between rounded-xl border border-aura-border/10 bg-aura-bg/40 px-4 py-2 text-xs font-mono">
                                <span className="text-aura-muted">Sync BER</span>
                                <span className="text-aura-text">
                                  {activeSegObj.metrics?.syncBer !== undefined && activeSegObj.metrics.syncBer !== null
                                    ? `${(activeSegObj.metrics.syncBer * 100).toFixed(2)}%`
                                    : 'N/A'}
                                </span>
                              </div>

                              <div className="flex items-center justify-between rounded-xl border border-aura-border/10 bg-aura-bg/40 px-4 py-2 text-xs font-mono">
                                <span className="text-aura-muted">ECC Scheme</span>
                                <span className="text-aura-text">
                                  {activeSegObj.metrics?.eccScheme === 1 ? 'Hamming(8,4)' : 'None'}
                                </span>
                              </div>

                              <div className="flex items-center justify-between rounded-xl border border-aura-border/10 bg-aura-bg/40 px-4 py-2 text-xs font-mono">
                                <span className="text-aura-muted">Corrected Bitflips</span>
                                <span className="text-aura-reveal font-semibold">
                                  {activeSegObj.metrics?.correctedBits ?? 0}
                                </span>
                              </div>

                              <div className="flex items-center justify-between rounded-xl border border-aura-border/10 bg-aura-bg/40 px-4 py-2 text-xs font-mono">
                                <span className="text-aura-muted">Uncorrectable Errors</span>
                                <span className={cn("font-semibold", (activeSegObj.metrics?.uncorrectableCount ?? 0) > 0 ? "text-aura-danger animate-pulse" : "text-aura-text")}>
                                  {activeSegObj.metrics?.uncorrectableCount ?? 0}
                                </span>
                              </div>

                              <div className="flex items-center justify-between rounded-xl border border-aura-border/10 bg-aura-bg/40 px-4 py-2 text-xs font-mono">
                                <span className="text-aura-muted">CRC Checksum</span>
                                <span className={cn(
                                  "font-semibold uppercase",
                                  activeSegObj.metrics?.payloadCrcOk ? "text-aura-reveal" : "text-aura-danger"
                                )}>
                                  {activeSegObj.metrics?.payloadCrcOk ? 'Pass' : 'Mismatch'}
                                </span>
                              </div>
                            </>
                          )
                        }
                        
                        return (
                          <div className="text-center text-aura-dim italic py-8 text-xs font-mono">
                            No active segment loaded. Select a part in the grid.
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>

                <div className="mt-4 text-[11px] text-center font-mono text-aura-dim bg-aura-bg/30 rounded-lg p-2.5 leading-relaxed border border-aura-border/5">
                  {(() => {
                    const activeSegIdx = (analysis.selectedPartNumber || 1) - 1
                    const activeSegObj = analysis.segments?.find(s => s.segment_index === activeSegIdx)
                    
                    if (activePanelTab === 'global') {
                      return analysis.summary.trustMessage || 'Verdict compiled from channel diagnostics.'
                    }
                    
                    if (activeSegObj?.status === 'reconstructed') {
                      return 'This segment was reconstructed in-memory via XOR parity mathematics.'
                    }
                    
                    return `Segment status is ${activeSegObj?.status || 'unknown'}.`
                  })()}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}