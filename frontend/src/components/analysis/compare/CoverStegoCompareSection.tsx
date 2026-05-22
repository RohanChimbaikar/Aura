import { Panel } from '../../AuraPrimitives'
import type { AnalysisPayload } from '../types/analysis'
import { cardTitleClass, cardSubtitleClass } from '../utils/formatting'
import { UnavailablePanel } from '../shared/UnavailablePanel'
import { PartSelectorButton } from '../signal/PartSelector'
import { SpectrogramCompareCard } from './SpectrogramCompareCard'
import { WaveformStrip } from '../signal/WaveformStrip'

export function CoverStegoCompareSection({
  analysis,
  selectedPart,
  onSelectPart,
}: {
  analysis: AnalysisPayload
  selectedPart: number | 'all'
  onSelectPart: (part: number | 'all') => void
}) {
  const compareSpectrogram = analysis.charts.compareSpectrogram
  const waveformComparison = analysis.charts.waveformComparison
  const partOptions = compareSpectrogram?.partOptions ?? []

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className={cardTitleClass()}>Cover vs Stego Comparison</div>
          <div className={cardSubtitleClass()}>
            Visual comparison using the original carrier and the generated stego audio.
          </div>
        </div>
        {analysis.provenance.grouped && partOptions.length ? (
          <div className="flex flex-wrap gap-1.5 rounded-full border border-aura-border/10 bg-aura-bg/24 p-1">
            <PartSelectorButton
              active={selectedPart === 'all'}
              onClick={() => onSelectPart('all')}
              label="All"
            />
            {partOptions.map((part) => (
              <PartSelectorButton
                key={part}
                active={selectedPart === part}
                onClick={() => onSelectPart(part)}
                label={`Part ${part}`}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SpectrogramCompareCard label="Cover" src={compareSpectrogram?.coverImageUrl} available={Boolean(compareSpectrogram?.available)} />
        <SpectrogramCompareCard label="Stego" src={compareSpectrogram?.stegoImageUrl} available={Boolean(compareSpectrogram?.available)} />
        <SpectrogramCompareCard label="Difference" src={compareSpectrogram?.diffImageUrl} available={Boolean(compareSpectrogram?.available)} />
      </div>

      <Panel className="p-5 lg:p-6">
        <div className="mb-4">
          <div className={cardTitleClass()}>Waveform Comparison</div>
          <div className={cardSubtitleClass()}>
            Compact waveform evidence from real backend-derived traces.
          </div>
        </div>
        {waveformComparison?.available ? (
          <div className="grid gap-3">
            <WaveformStrip title="Cover waveform" points={waveformComparison.coverWaveform ?? []} />
            <WaveformStrip title="Stego waveform" points={waveformComparison.stegoWaveform ?? []} />
            <WaveformStrip title="Difference waveform" points={waveformComparison.diffWaveform ?? []} />
          </div>
        ) : (
          <UnavailablePanel message="Compare visuals are unavailable because the original cover audio link was not persisted for this transmission." />
        )}
      </Panel>
    </section>
  )
}
