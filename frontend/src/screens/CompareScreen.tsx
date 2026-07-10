import React, { useMemo, useState, useRef, useEffect } from 'react'
import { AudioLines, FileAudio, Play, Pause, Waves, Info, AlertTriangle, Volume2 } from 'lucide-react'
import { cn } from '../lib/utils'
import type { AnalysisPayload, SelectedAudio } from '../types'
import { resolveUrl } from '../services/api'
import { pointsToPath } from '../components/compare/utils'

interface CompareScreenProps {
  analysis: AnalysisPayload | null
  selectedAudio: SelectedAudio | null
  availableAudio: SelectedAudio[]
  loading: boolean
  error: string
  onSelectAudio: (audio: SelectedAudio) => void
  onAnalyzeAudio: (audio: SelectedAudio, options?: { force?: boolean }) => Promise<void> | void
  theme?: string
}

export default function CompareScreen({
  analysis,
  selectedAudio,
  availableAudio,
  loading,
  error,
  onSelectAudio,
  onAnalyzeAudio
}: CompareScreenProps) {
  // Sync Audio Playback State
  const coverAudioRef = useRef<HTMLAudioElement | null>(null)
  const stegoAudioRef = useRef<HTMLAudioElement | null>(null)
  
  const [activePlayer, setActivePlayer] = useState<'cover' | 'stego' | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [viewMode, setViewMode] = useState<'waveforms' | 'spectrograms'>('waveforms')
  
  // Track key of selected audio for the dropdown
  const selectedKey = selectedAudio
    ? `${selectedAudio.messageId || ''}__${selectedAudio.audioUrl || ''}__${selectedAudio.fileName || ''}`
    : ''

  // Reset audio states when selection changes
  useEffect(() => {
    setActivePlayer(null)
    setCurrentTime(0)
    setDuration(0)
    if (coverAudioRef.current) coverAudioRef.current.load()
    if (stegoAudioRef.current) stegoAudioRef.current.load()
  }, [selectedAudio])

  const togglePlayback = (player: 'cover' | 'stego') => {
    const targetRef = player === 'cover' ? coverAudioRef.current : stegoAudioRef.current;
    const otherRef = player === 'cover' ? stegoAudioRef.current : coverAudioRef.current;

    if (!targetRef || !targetRef.src || targetRef.src.endsWith('undefined') || targetRef.src === window.location.href) {
      console.warn(`Missing source for ${player} audio.`);
      return;
    }

    if (activePlayer === player) {
      targetRef.pause();
      setActivePlayer(null);
    } else {
      if (otherRef) {
        otherRef.pause();
        otherRef.currentTime = targetRef.currentTime; // Keep them synced
      }
      targetRef.play().catch(console.error);
      setActivePlayer(player);
    }
  }

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    setCurrentTime(e.currentTarget.currentTime)
  }

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    if (duration === 0 || e.currentTarget.duration > 0) {
      setDuration(e.currentTarget.duration)
    }
  }

  const handleAudioEnded = () => {
    setActivePlayer(null)
    setCurrentTime(0)
  }

  const playbackRatio = duration > 0 ? currentTime / duration : 0

  // Sync cursor seek on waveform click
  const handleWaveformClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (duration <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clickRatio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const newTime = clickRatio * duration
    
    if (coverAudioRef.current) coverAudioRef.current.currentTime = newTime
    if (stegoAudioRef.current) stegoAudioRef.current.currentTime = newTime
    setCurrentTime(newTime)
  }

  // Synced hover timeline for waveforms
  const [hoverRatio, setHoverRatio] = useState<number | null>(null)
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setHoverRatio(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)))
  }
  const handlePointerLeave = () => setHoverRatio(null)

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
    if (picked) onSelectAudio(picked)
  }

  const handleAnalyzeClick = () => {
    if (selectedAudio) onAnalyzeAudio(selectedAudio, { force: true })
  }

  // --- BULLETPROOF COVER AUDIO EXTRACTION & 404 FIX ---
  // --- BULLETPROOF COVER AUDIO EXTRACTION & VITE BYPASS ---
  let rawCoverSrc: string | undefined = undefined;

  if (selectedAudio?.metadata?.carrier_path) {
    rawCoverSrc = selectedAudio.metadata.carrier_path;
  } else if (selectedAudio?.metadata?.segments?.[0]?.carrier_name) {
    rawCoverSrc = `aura_carrier_bank/${selectedAudio.metadata.segments[0].carrier_name}`;
  } else if ((analysis as any)?.provenance?.databaseProvenance?.audio_assets) {
    const dbAssets = (analysis as any).provenance.databaseProvenance.audio_assets;
    const coverAsset = dbAssets.find((a: any) => a.kind === 'cover');
    if (coverAsset?.file_path) {
      rawCoverSrc = coverAsset.file_path;
    }
  }

  // Force absolute path to hit Flask directly (bypassing Vite's HTML fallback)
  let coverAudioSrc: string | undefined = undefined;
  if (rawCoverSrc) {
    const filename = rawCoverSrc.replace(/\\/g, '/').split('/').pop(); 
    // This forces the request to your Python backend port
    coverAudioSrc = `http://127.0.0.1:5000/aura_carrier_bank/${filename}`;
  }

  const stegoAudioSrc = selectedAudio?.audioUrl;
  // ------------------------------------------

  // Waveform coordinates mapping
  const coverPoints = analysis?.charts.waveformComparison?.coverWaveform || []
  const stegoPoints = analysis?.charts.waveformComparison?.stegoWaveform || []
  const diffPoints = analysis?.charts.waveformComparison?.diffWaveform || analysis?.charts.waveformComparison?.differenceWaveform || []

  return (
    <div className="min-h-screen bg-aura-bg text-aura-text transition-colors duration-300">
      <div className="mx-auto max-w-[1400px] p-4 lg:p-8 space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-aura-border/15 pb-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-aura-reveal/30 bg-aura-reveal/10 p-3 text-aura-reveal">
              <AudioLines className="h-6 w-6" />
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                Signal Comparison Mode
              </div>
              <h1 className="mt-1 text-4xl lg:text-5xl font-semibold tracking-[-0.04em]">
                Compare
              </h1>
            </div>
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

        {/* Global Loading & Error Handlers */}
        {loading ? (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="animate-pulse rounded-2xl border border-aura-border/10 bg-aura-surface/40 h-32" />
              <div className="animate-pulse rounded-2xl border border-aura-border/10 bg-aura-surface/40 h-32" />
            </div>
            <div className="animate-pulse rounded-2xl border border-aura-border/10 bg-aura-surface/40 h-64" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-aura-danger/20 bg-aura-danger/5 p-6 flex flex-col items-center text-center gap-4">
            <AlertTriangle className="h-10 w-10 text-aura-danger animate-bounce" />
            <div>
              <h3 className="text-lg font-semibold text-aura-danger">Analysis Failed</h3>
              <p className="mt-1 text-sm text-aura-muted max-w-lg">{error}</p>
            </div>
            {selectedAudio && (
              <button onClick={handleAnalyzeClick} className="rounded-lg bg-aura-danger text-white px-5 py-2 font-mono text-xs font-semibold hover:bg-aura-danger/90 transition-colors">
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
              <button onClick={handleAnalyzeClick} className="mt-6 rounded-lg bg-aura-reveal text-aura-bg px-6 py-2.5 font-mono text-xs font-semibold hover:bg-aura-reveal/90 transition-all shadow-lg">
                Run Forensics
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-fadeIn">
            
            {/* Hidden Audio Elements */}
            {coverAudioSrc && (
              <audio ref={coverAudioRef} src={resolveUrl(coverAudioSrc)} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata} onEnded={handleAudioEnded} />
            )}
            {stegoAudioSrc && (
              <audio ref={stegoAudioRef} src={resolveUrl(stegoAudioSrc)} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata} onEnded={handleAudioEnded} />
            )}

            {/* 1. AUDIO PLAYBACK COMPARISON SECTION */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Cover Audio Player */}
              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-6 flex flex-col gap-4 shadow-sm">
                <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-reveal">Original Cover Audio</h3>
                <button 
                  onClick={() => togglePlayback('cover')}
                  disabled={!coverAudioSrc}
                  className={cn(
                    "w-full py-4 rounded-xl border transition-all flex items-center justify-center gap-3",
                    !coverAudioSrc ? "bg-aura-bg/50 border-aura-border/10 text-aura-dim cursor-not-allowed" :
                    activePlayer === 'cover' ? "bg-aura-reveal text-aura-bg border-aura-reveal" : "bg-aura-bg border-aura-border/20 text-aura-text hover:border-aura-reveal/50"
                  )}
                >
                  {activePlayer === 'cover' ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
                  <span className="font-mono text-sm uppercase tracking-widest">
                    {!coverAudioSrc ? 'Cover Audio Unavailable' : 'Play Cover'}
                  </span>
                </button>
              </div>

              {/* Stego Audio Player */}
              <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/70 p-6 flex flex-col gap-4 shadow-sm">
                <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-accent">Generated Stego Audio</h3>
                <button 
                  onClick={() => togglePlayback('stego')}
                  disabled={!stegoAudioSrc}
                  className={cn(
                    "w-full py-4 rounded-xl border transition-all flex items-center justify-center gap-3",
                    !stegoAudioSrc ? "bg-aura-bg/50 border-aura-border/10 text-aura-dim cursor-not-allowed" :
                    activePlayer === 'stego' ? "bg-aura-accent text-aura-bg border-aura-accent" : "bg-aura-bg border-aura-border/20 text-aura-text hover:border-aura-accent/50"
                  )}
                >
                  {activePlayer === 'stego' ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
                  <span className="font-mono text-sm uppercase tracking-widest">Play Stego</span>
                </button>
              </div>
            </div>

            {/* 2. FORENSIC INTEGRITY SUITE */}
            <div className="rounded-2xl border border-aura-border/15 bg-aura-surface/50 p-6 shadow-sm">
              <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-aura-border/10 pb-4">
                <div className="flex items-center gap-3">
                  <AudioLines className="h-5 w-5 text-aura-reveal" />
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">
                      Visual Diagnostics
                    </div>
                    <div className="mt-1 text-xl font-semibold">
                      Forensic Integrity Suite
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-aura-bg/50 p-1 rounded-xl border border-aura-border/10">
                  <button 
                    onClick={() => setViewMode('waveforms')} 
                    className={cn("px-4 py-1.5 rounded-lg text-xs font-mono transition-colors", viewMode === 'waveforms' ? "bg-aura-reveal text-white shadow" : "text-aura-muted hover:text-aura-text")}
                  >
                    Waveforms
                  </button>
                  <button 
                    onClick={() => setViewMode('spectrograms')} 
                    className={cn("px-4 py-1.5 rounded-lg text-xs font-mono transition-colors", viewMode === 'spectrograms' ? "bg-aura-reveal text-white shadow" : "text-aura-muted hover:text-aura-text")}
                  >
                    Spectrograms
                  </button>
                </div>
              </div>

              {viewMode === 'waveforms' ? (
                /* WAVEFORM DEVIATION ANALYSIS */
                <div className="space-y-6 animate-fadeIn">
                  <div className="flex items-center gap-3 border border-aura-border/15 rounded-xl bg-aura-bg/50 px-4 py-2 font-mono text-xs shadow-inner w-fit mb-4">
                    <Volume2 className="h-4 w-4 text-aura-muted" />
                    <span className="text-aura-muted min-w-[70px]">
                      {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}
                      <span className="text-aura-dim"> / </span>
                      {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
                    </span>
                  </div>

                  <div>
                    <div className="mb-1.5 flex justify-between font-mono text-[10px] uppercase tracking-wider text-aura-dim">
                      <span>Original Cover</span>
                      <span className="text-aura-reveal">Synced</span>
                    </div>
                    <div className="relative h-24 w-full bg-aura-bg/40 border border-aura-border/10 rounded-xl overflow-hidden cursor-pointer hover:border-aura-reveal/30 transition-colors">
                      {coverPoints.length ? (
                        <svg viewBox="0 0 800 100" preserveAspectRatio="none" className="h-full w-full" onClick={handleWaveformClick} onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}>
                          <path d={pointsToPath(coverPoints, 800, 50, 42)} fill="none" stroke="rgb(var(--aura-reveal))" strokeWidth={1.5} />
                          {playbackRatio > 0 && <line x1={playbackRatio * 800} x2={playbackRatio * 800} y1={0} y2={100} stroke="rgb(var(--aura-text))" strokeWidth={1.8} />}
                          {hoverRatio !== null && <line x1={hoverRatio * 800} x2={hoverRatio * 800} y1={0} y2={100} stroke="rgb(var(--aura-text) / 0.3)" strokeWidth={1} strokeDasharray="4 4" />}
                        </svg>
                      ) : (
                        <div className="flex h-full items-center justify-center font-mono text-xs text-aura-dim">Cover waveform samples not emitted</div>
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
                        <svg viewBox="0 0 800 100" preserveAspectRatio="none" className="h-full w-full" onClick={handleWaveformClick} onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}>
                          <path d={pointsToPath(stegoPoints, 800, 50, 42)} fill="none" stroke="rgb(var(--aura-accent))" strokeWidth={1.5} />
                          {playbackRatio > 0 && <line x1={playbackRatio * 800} x2={playbackRatio * 800} y1={0} y2={100} stroke="rgb(var(--aura-text))" strokeWidth={1.8} />}
                          {hoverRatio !== null && <line x1={hoverRatio * 800} x2={hoverRatio * 800} y1={0} y2={100} stroke="rgb(var(--aura-text) / 0.3)" strokeWidth={1} strokeDasharray="4 4" />}
                        </svg>
                      ) : (
                        <div className="flex h-full items-center justify-center font-mono text-xs text-aura-dim">Stego waveform samples not emitted</div>
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
                        <svg viewBox="0 0 800 100" preserveAspectRatio="none" className="h-full w-full" onClick={handleWaveformClick} onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}>
                          <path d={pointsToPath(diffPoints, 800, 50, 42)} fill="none" stroke="rgb(var(--aura-danger))" strokeWidth={1.5} />
                          {playbackRatio > 0 && <line x1={playbackRatio * 800} x2={playbackRatio * 800} y1={0} y2={100} stroke="rgb(var(--aura-text))" strokeWidth={1.8} />}
                          {hoverRatio !== null && <line x1={hoverRatio * 800} x2={hoverRatio * 800} y1={0} y2={100} stroke="rgb(var(--aura-text) / 0.3)" strokeWidth={1} strokeDasharray="4 4" />}
                        </svg>
                      ) : (
                        <div className="flex h-full items-center justify-center font-mono text-xs text-aura-dim">Residual difference waveform samples not emitted</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* SPECTROGRAM ANALYSIS */
         /* SPECTROGRAM ANALYSIS */
              <div className="flex flex-col gap-6 w-full animate-fadeIn">
                <div className="rounded-2xl border border-aura-border/15 bg-aura-bg/30 p-5 shadow-sm flex flex-col hover:-translate-y-1 transition-transform w-full">
                  <div className="mb-4 flex items-center gap-3">
                    <Waves className="h-5 w-5 text-aura-reveal" />
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">Frequency Map</div>
                      <div className="mt-1 text-md font-semibold">Cover Spectrogram</div>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center justify-center rounded-xl border border-aura-border/10 bg-aura-bg/40 p-2 overflow-hidden h-64 w-full">
                    {analysis.charts.compareSpectrogram?.coverImageUrl ? (
                      <img src={resolveUrl(analysis.charts.compareSpectrogram.coverImageUrl)} alt="Cover" className="h-full w-full object-cover rounded-lg" />
                    ) : <div className="font-mono text-xs text-aura-dim">Image unavailable</div>}
                  </div>
                </div>

                <div className="rounded-2xl border border-aura-border/15 bg-aura-bg/30 p-5 shadow-sm flex flex-col hover:-translate-y-1 transition-transform w-full">
                  <div className="mb-4 flex items-center gap-3">
                    <Waves className="h-5 w-5 text-aura-accent" />
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">Frequency Map</div>
                      <div className="mt-1 text-md font-semibold">Stego Spectrogram</div>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center justify-center rounded-xl border border-aura-border/10 bg-aura-bg/40 p-2 overflow-hidden h-64 w-full">
                    {analysis.charts.compareSpectrogram?.stegoImageUrl ? (
                      <img src={resolveUrl(analysis.charts.compareSpectrogram.stegoImageUrl)} alt="Stego" className="h-full w-full object-cover rounded-lg" />
                    ) : <div className="font-mono text-xs text-aura-dim">Image unavailable</div>}
                  </div>
                </div>

                <div className="rounded-2xl border border-aura-border/15 bg-aura-bg/30 p-5 shadow-sm flex flex-col hover:-translate-y-1 transition-transform w-full">
                  <div className="mb-4 flex items-center gap-3">
                    <Waves className="h-5 w-5 text-aura-danger" />
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-aura-dim">Frequency Delta</div>
                      <div className="mt-1 text-md font-semibold">Residual Map</div>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center justify-center rounded-xl border border-aura-border/10 bg-aura-bg/40 p-2 overflow-hidden h-64 w-full">
                    {analysis.charts.compareSpectrogram?.diffImageUrl ? (
                      <img src={resolveUrl(analysis.charts.compareSpectrogram.diffImageUrl)} alt="Residual" className="h-full w-full object-cover rounded-lg" />
                    ) : <div className="font-mono text-xs text-aura-dim">Image unavailable</div>}
                  </div>
                </div>
              </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}