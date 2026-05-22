import { ChevronDown } from 'lucide-react'
import { Panel } from '../../AuraPrimitives'
import type { AudioOption, SelectedAudio } from '../types/analysis'

export function AnalysisTopBar({
  options,
  pickerKey,
  onPickerChange,
  pickedAudio,
  sourceLabel,
  loading,
  error,
  onAnalyzeClick,
}: {
  options: AudioOption[]
  pickerKey: string
  onPickerChange: (key: string) => void
  pickedAudio: SelectedAudio | null
  sourceLabel: string
  loading: boolean
  error: string
  onAnalyzeClick: () => void
}) {
  return (
    <Panel className="p-4 lg:p-5">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-aura-dim/90">
            Input audio
          </div>

          <div className="relative">
            <select
              value={pickerKey}
              onChange={(e) => onPickerChange(e.target.value)}
              className="h-11 w-full appearance-none rounded-2xl border border-aura-border/10 bg-aura-bg/35 px-4 pr-10 text-sm text-aura-text outline-none transition-colors focus:border-aura-reveal/35"
            >
              {options.length === 0 ? <option value="">No audio available</option> : null}
              {options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.audio.fileName} &bull; {option.audio.source}
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
            onClick={onAnalyzeClick}
            disabled={!pickedAudio || loading}
            className="h-11 rounded-2xl border border-aura-reveal/18 bg-aura-reveal/10 px-5 text-sm font-semibold text-aura-reveal transition-all hover:bg-aura-reveal/14 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Running analysis\u2026' : 'Run analysis'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-2xl border border-aura-danger/20 bg-aura-danger/10 px-4 py-3 text-sm text-aura-danger">
          {error}
        </div>
      ) : null}
    </Panel>
  )
}
