import { Loader2 } from 'lucide-react'

import { AudioSelector } from './AudioSelector'
import { ToolbarChip } from './ToolbarChip'

import type { SelectedAudio } from '../../../types'

type Props = {
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
}

export function AnalysisTopBar({
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
}: Props) {
  const filesLabel = (() => {
    if (!selectedAudio) return 'no files'

    const total = selectedAudio.totalSegments ?? selectedAudio.segments?.length

    if (sourceLabel === 'grouped') {
      if (typeof total === 'number' && Number.isFinite(total) && total > 1) {
        return `${total} files`
      }

      return 'grouped transmission'
    }

    return '1 file'
  })()

  const transmissionLabel =
    sourceLabel === 'grouped'
      ? 'grouped transmission'
      : 'single audio'



  return (
    <header className="bg-transparent">
      <div className="grid min-h-[110px] grid-cols-1 gap-4 py-4 lg:grid-cols-[25%_50%_25%] lg:items-center">
        <div className="min-w-0 self-center">
          <h1 className="text-[30px] font-semibold leading-none tracking-normal text-aura-text lg:text-[38px]">
            Analysis
          </h1>

          <div className="mt-2 text-[12px] leading-4 text-aura-muted">
            Neural signal recovery workstation
          </div>
        </div>

        <div className="min-w-0 self-center">
          <AudioSelector
            options={options}
            pickerKey={pickerKey}
            onPickerChange={onPickerChange}
            selectedAudio={selectedAudio}
          />

          <div className="mt-2 flex min-w-0 items-center gap-2 overflow-hidden text-[10px] text-aura-dim">
            <span className="shrink-0">{filesLabel}</span>

            <span className="shrink-0 opacity-60">/</span>

            <span className="min-w-0 truncate">
              {transmissionLabel}
            </span>
          </div>
        </div>

        <div className="min-w-0 self-center">
          <div className="flex min-w-0 flex-nowrap justify-start gap-1.5 overflow-hidden lg:justify-end">
            <ToolbarChip
              value={modelVersion}
              className="max-w-[92px]"
            />

            <ToolbarChip
              value={sourceLabel}
              className="max-w-[78px]"
            />

            <ToolbarChip
              value={timestamp}
              className="max-w-[90px]"
            />
          </div>

          <div className="mt-3 flex min-w-0 items-center gap-2 lg:justify-end">
            <button
              type="button"
              onClick={onAnalyze}
              disabled={analyzeDisabled}
              className="aura-tactile-button inline-flex h-10 shrink-0 items-center justify-center rounded-[10px] px-4 text-[12px] font-semibold text-aura-bg disabled:cursor-not-allowed disabled:opacity-45"
            >
              {analyzing ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2
                    size={13}
                    className="animate-spin"
                  />

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
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-[10px] border border-aura-border/10 px-4 text-[12px] font-medium text-aura-text transition-colors hover:bg-aura-surfaceSoft disabled:cursor-not-allowed disabled:opacity-40"
            >
              Export
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}