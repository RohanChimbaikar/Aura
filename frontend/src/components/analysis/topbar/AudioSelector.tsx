import { ChevronDown } from 'lucide-react'
import type { AudioOption, SelectedAudio } from '../types/analysis'
import { EyebrowLabel } from '../shared/EyebrowLabel'

export function AudioSelector({
  options,
  pickerKey,
  onPickerChange,
  pickedAudio,
}: {
  options: AudioOption[]
  pickerKey: string
  onPickerChange: (key: string) => void
  pickedAudio: SelectedAudio | null
}) {
  return (
    <div>
      <EyebrowLabel>Input audio</EyebrowLabel>

      <div className="relative mt-2">
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
  )
}
