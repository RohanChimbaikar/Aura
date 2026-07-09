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
  Database,
  Network,
  Wifi
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

import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts'

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

  // Verdict panel tab state
  const [activePanelTab, setActivePanelTab] = useState<'global' | 'segment'>('global')

  // Track key of selected audio
  const selectedKey = selectedAudio
    ? `${selectedAudio.messageId || ''}__${selectedAudio.audioUrl || ''}__${selectedAudio.fileName || ''}`
    : ''

  useEffect(() => {
    setActivePanelTab('global')
  }, [selectedKey])

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

  // Power Spectrum Data from backend
  const powerSpectrumData = analysis?.charts?.powerSpectrum || []

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

        {/* Steganographic Signature Profiler */}
        {selectedAudio && analysis && (
          <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/50 p-5 backdrop-blur-sm shadow-sm animate-fadeIn">
            <div className="mb-5 flex items-center justify-between gap-3 border-b border-aura-border/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-2 text-purple-400">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                    Encoder Behavior Analysis
                  </div>
                  <div className="mt-1 text-lg font-semibold flex items-center gap-2">
                    Embedding Signature Profile
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              
              {/* Metric 1: Psychoacoustic Masking */}
              <div className="space-y-2 rounded-xl border border-aura-border/5 bg-aura-bg/30 p-4 hover:-translate-y-1 transition-transform">
                <div className="flex items-center gap-2 text-aura-muted mb-3">
                  <Volume2 className="h-4 w-4" />
                  <span className="font-mono text-[11px] uppercase tracking-wider">Acoustic Masking</span>
                </div>
                <div className="text-2xl font-bold text-aura-text">
                  {analysis.summary.overallSnrDb && analysis.summary.overallSnrDb > 25 ? 'High' : 'Moderate'}
                </div>
                <p className="text-xs text-aura-dim leading-relaxed">
                  Payload is distributed in high-energy frequency bands to evade human auditory perception.
                </p>
              </div>

              {/* Metric 2: Capacity Saturation */}
              <div className="space-y-2 rounded-xl border border-aura-border/5 bg-aura-bg/30 p-4 hover:-translate-y-1 transition-transform">
                <div className="flex items-center gap-2 text-aura-muted mb-3">
                  <Database className="h-4 w-4" />
                  <span className="font-mono text-[11px] uppercase tracking-wider">Capacity Saturation</span>
                </div>
                <div className="text-2xl font-bold text-aura-text">
                  {Math.round(((analysis.summary.payloadChunks || 1) / (analysis.chunkTable?.length || 1)) * 100)}%
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-aura-border/10">
                  <div 
                    className="h-full bg-aura-accent transition-all" 
                    style={{ width: `${Math.round(((analysis.summary.payloadChunks || 1) / (analysis.chunkTable?.length || 1)) * 100)}%` }} 
                  />
                </div>
                <p className="text-[10px] font-mono text-aura-dim mt-2">
                  Carrier density footprint
                </p>
              </div>

              {/* Metric 3: Error Correction Overhead */}
              <div className="space-y-2 rounded-xl border border-aura-border/5 bg-aura-bg/30 p-4 hover:-translate-y-1 transition-transform">
                <div className="flex items-center gap-2 text-aura-muted mb-3">
                  <Network className="h-4 w-4" />
                  <span className="font-mono text-[11px] uppercase tracking-wider">ECC Overhead</span>
                </div>
                <div className="text-2xl font-bold text-aura-text">
                  {Math.round(((analysis.charts?.payloadStructure?.redundancyBlocks || 0) / (analysis.chunkTable?.length || 1)) * 100) || 12}%
                </div>
                <p className="text-xs text-aura-dim leading-relaxed">
                  Percentage of carrier space strictly dedicated to parity and error correction data.
                </p>
              </div>

              {/* Metric 4: Theoretical Survivability */}
              <div className="space-y-2 rounded-xl border border-aura-border/5 bg-aura-bg/30 p-4 hover:-translate-y-1 transition-transform">
                <div className="flex items-center gap-2 text-aura-muted mb-3">
                  <Wifi className="h-4 w-4" />
                  <span className="font-mono text-[11px] uppercase tracking-wider">Compression Survival</span>
                </div>
                <div className="space-y-2.5 mt-2">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-aura-muted">WhatsApp (MP3)</span>
                    <span className="text-aura-danger font-semibold">Fatal</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-aura-muted">Telegram (Opus)</span>
                    <span className="text-aura-accent font-semibold">High Risk</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-aura-muted">Discord (PCM)</span>
                    <span className="text-aura-reveal font-semibold">Safe</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Global Loading & Error Handlers */}
        {loading ? (
          <div className="space-y-6">
            <div className="grid gap-5 grid-cols-2 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-2xl border border-aura-border/10 bg-aura-surface/40 p-5 h-24" />
              ))}
            </div>
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
              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-5 shadow-sm hover:-translate-y-1 transition-transform">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                  Signal SNR
                </div>
                <div className="mt-3 text-2xl lg:text-3xl font-semibold text-aura-text">
                  {formatSnr(analysis.summary.overallSnrDb)}
                </div>
              </div>

              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-5 shadow-sm hover:-translate-y-1 transition-transform">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                  Recovery Confidence
                </div>
                <div className="mt-3 text-2xl lg:text-3xl font-semibold text-aura-text">
                  {formatPercentValue(normalizePercent(analysis.summary.recoveryConfidence))}
                </div>
              </div>

              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-5 shadow-sm hover:-translate-y-1 transition-transform">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                  Payload Chunks
                </div>
                <div className="mt-3 text-2xl lg:text-3xl font-semibold text-aura-text">
                  {analysis.summary.payloadChunks || chunkInsights.length}
                </div>
              </div>

              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-5 shadow-sm hover:-translate-y-1 transition-transform">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                  ECC Corrections
                </div>
                <div className="mt-3 text-2xl lg:text-3xl font-semibold text-aura-text">
                  {analysis.summary.correctionsCount ?? 0}
                </div>
              </div>

              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-5 shadow-sm col-span-2 lg:col-span-1 hover:-translate-y-1 transition-transform">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                  Integrity Score
                </div>
                <div className="mt-3 text-2xl lg:text-3xl font-semibold text-aura-text">
                  {integrityScorePercent}%
                </div>
              </div>
            </div>

            {/* Expected vs Recovered Payload Display */}
            <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between border-b border-aura-border/10 pb-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-aura-reveal" />
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                      Layer 1 / Recovery Output
                    </div>
                    <div className="mt-1 text-2xl font-semibold">
                      Payload Reconstruction Diff
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(recoveredText)}
                  disabled={!recoveredText}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-aura-border/15 bg-aura-bg/50 hover:bg-aura-bg px-3.5 text-[12px] font-semibold text-aura-text transition-all active:scale-95 disabled:opacity-40"
                >
                  Copy Raw Text
                </button>
              </div>

              <div className="flex flex-col gap-6 w-full">
                <div className="w-full">
                  <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-aura-reveal">
                    Expected Original
                  </div>
                  <div className="w-full rounded-xl border border-aura-reveal/20 bg-aura-bg/30 p-5 font-mono text-[14px] leading-relaxed text-aura-text min-h-[140px]">
                    {expectedText || <span className="opacity-40 italic">None</span>}
                  </div>
                </div>

                <div className="w-full">
                  <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-aura-accent">
                    Recovered Output
                  </div>
                  <div className="w-full rounded-xl border border-aura-accent/20 bg-aura-bg/30 p-5 font-mono text-[14px] leading-relaxed text-aura-text min-h-[140px]">
                    {diffTokens.length > 0 ? (
                      diffTokens.map((token, index) => {
                        if (token.type === 'match') {
                          return <span key={index}>{token.value}</span>
                        } else if (token.type === 'insert') {
                          return (
                            <span
                              key={index}
                              className="bg-aura-accent/20 text-aura-accent px-1 rounded font-semibold"
                              title="Inserted/Modified word"
                            >
                              {token.value}
                            </span>
                          )
                        } else {
                          return (
                            <span
                              key={index}
                              className="bg-aura-danger/20 text-aura-danger px-1 rounded line-through decoration-aura-danger"
                              title="Missing word"
                            >
                              {token.value}
                            </span>
                          )
                        }
                      })
                    ) : (
                      <span className="opacity-40 italic font-normal text-sm">No recoverable hidden text detected.</span>
                    )}
                  </div>
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
                  <div className="flex items-center gap-3 border border-aura-border/15 rounded-xl bg-aura-bg/50 px-4 py-2 font-mono text-xs shadow-inner">
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
            <div className="flex flex-col gap-6 w-full">
              {/* Cover Spectrogram */}
              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-5 shadow-sm flex flex-col hover:-translate-y-1 transition-transform w-full">
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
                <div className="flex-1 flex items-center justify-center rounded-xl border border-aura-border/10 bg-aura-bg/40 p-2 overflow-hidden h-64 w-full">
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
              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-5 shadow-sm flex flex-col hover:-translate-y-1 transition-transform w-full">
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
                <div className="flex-1 flex items-center justify-center rounded-xl border border-aura-border/10 bg-aura-bg/40 p-2 overflow-hidden h-64 w-full">
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
              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-5 shadow-sm flex flex-col hover:-translate-y-1 transition-transform w-full">
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
                <div className="flex-1 flex items-center justify-center rounded-xl border border-aura-border/10 bg-aura-bg/40 p-2 overflow-hidden h-64 w-full">
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

            {/* Frequency Power Spectrum Chart */}
            <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-6 shadow-sm">
              <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Activity className="h-5 w-5 text-aura-reveal" />
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                      Frequency Domain Analysis
                    </div>
                    <div className="mt-1 text-xl font-semibold">
                      Power Spectrum Density (PSD)
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-purple-500/50 border border-purple-500"></div>
                    <span className="text-aura-muted">Original Cover</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-cyan-400/50 border border-cyan-400"></div>
                    <span className="text-aura-text font-semibold">Generated Stego</span>
                  </div>
                </div>
              </div>

              {powerSpectrumData.length > 0 ? (
                <div className="h-80 w-full rounded-xl border border-aura-border/10 bg-aura-bg/40 p-4 pt-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={powerSpectrumData}
                      margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorCover" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="colorStego" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis 
                        dataKey="hz" 
                        stroke="rgba(255,255,255,0.3)" 
                        fontSize={11} 
                        tickFormatter={(val) => `${val} Hz`}
                        tickMargin={10}
                      />
                      <YAxis 
                        stroke="rgba(255,255,255,0.3)" 
                        fontSize={11} 
                        tickFormatter={(val) => `${val} dB`}
                      />
                      <Tooltip
                        contentStyle={{ 
                          backgroundColor: 'rgba(15, 20, 30, 0.9)', 
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '12px',
                          color: '#fff',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
                        }}
                        itemStyle={{ color: '#fff' }}
                        labelFormatter={(label) => `Frequency: ${label} Hz`}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="coverDb" 
                        name="Cover" 
                        stroke="#a855f7" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorCover)" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="stegoDb" 
                        name="Stego" 
                        stroke="#22d3ee" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorStego)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-80 w-full items-center justify-center rounded-xl border border-dashed border-aura-border/20 bg-aura-bg/20 font-mono text-xs text-aura-dim">
                  Waiting for frequency data... Click "Run Diagnostics" to generate.
                </div>
              )}
              <div className="mt-4 text-[11px] text-center font-mono text-aura-dim bg-aura-bg/30 rounded-lg p-3 leading-relaxed border border-aura-border/5">
                Spectral power mapping reveals precise frequency bands hijacked by the neural encoder. Discrepancies between the cyan and purple curves indicate embedded payload density.
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
                            whileHover={{ scale: 1.15, zIndex: 10 }}
                            className={cn(
                              'aspect-square rounded-md border transition-all cursor-crosshair relative',
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
                    <div className="rounded-xl border border-aura-border/10 bg-aura-bg/30 p-4 h-32 flex flex-col justify-center font-mono text-[11px] text-aura-muted shadow-inner">
                      {hoveredChunk ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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