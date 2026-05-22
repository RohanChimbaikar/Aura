import { Panel } from '../../AuraPrimitives'
import type { AudioOption, SelectedAudio } from '../types/analysis'
import { AudioSelector } from './AudioSelector'
import { ToolbarChip } from './ToolbarChip'

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
        <AudioSelector
          options={options}
          pickerKey={pickerKey}
          onPickerChange={onPickerChange}
          pickedAudio={pickedAudio}
        />

        <div className="flex items-center gap-2 lg:justify-end">
          <ToolbarChip label="Source" value={sourceLabel} />

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
