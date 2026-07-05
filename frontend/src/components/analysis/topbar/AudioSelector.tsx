import { ChevronDown, FileAudio } from 'lucide-react'

import type { SelectedAudio } from '../../../types'

type Props = {
  options: Array<{ key: string; audio: SelectedAudio }>
  pickerKey: string
  onPickerChange: (key: string) => void
  selectedAudio: SelectedAudio | null
}

export function AudioSelector({
  options,
  pickerKey,
  onPickerChange,
  selectedAudio,
}: Props) {
  const selectedName =
    selectedAudio?.selectedPartFilename ||
    selectedAudio?.fileName ||
    'Select audio target'

  const selectedSource =
    selectedAudio?.source || 'Unselected'

  return (
    <label
      className="block min-w-0"
      title={`${selectedName} / ${selectedSource}`}
    >
      <span className="sr-only">
        Selected audio
      </span>

      <div className="aura-toolbar-select relative flex h-12 min-w-0 items-center gap-3 rounded-[12px] px-3">
        <FileAudio
          size={16}
          className="shrink-0 text-aura-dim"
        />

        <div className="pointer-events-none min-w-0 flex-1 overflow-hidden pr-9">
          <div className="flex min-w-0 items-baseline gap-1.5 font-mono text-[12px] text-aura-text">
            <span className="min-w-0 truncate">
              {selectedName}
            </span>

            <span className="shrink-0 text-aura-dim">
              /
            </span>

            <span className="shrink-0 text-aura-muted">
              {selectedSource}
            </span>
          </div>
        </div>

        <select
          value={pickerKey}
          onChange={(event) =>
            onPickerChange(event.target.value)
          }
          className="absolute inset-0 h-12 w-full cursor-pointer appearance-none border-0 bg-transparent px-3 pr-10 text-transparent outline-none"
        >
          {options.length === 0 ? (
            <option value="">
              No audio available
            </option>
          ) : null}

          {options.map((option) => (
            <option
              key={option.key}
              value={option.key}
            >
              {option.audio.fileName} /{' '}
              {option.audio.source}
            </option>
          ))}
        </select>

        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-aura-dim"
        />
      </div>
    </label>
  )
}