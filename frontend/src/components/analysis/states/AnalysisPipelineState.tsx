import { Panel, Stat } from '../../AuraPrimitives'
import type { AnalysisStepState, SelectedAudio } from '../types/analysis'
import { ANALYSIS_PIPELINE_STEPS } from '../utils/constants'
import { parseTotalParts } from '../utils/math'
import { EyebrowLabel } from '../shared/EyebrowLabel'
import { AnalysisPipelineStepCard } from './AnalysisPipelineStepCard'

export function AnalysisPipelineState({
  sourceType,
  selectedAudio,
  activeStepIndex,
}: {
  sourceType: string
  selectedAudio: SelectedAudio | null
  activeStepIndex: number
}) {
  const expectedFiles =
    sourceType === 'grouped'
      ? selectedAudio?.totalSegments ||
        selectedAudio?.segments?.length ||
        parseTotalParts(selectedAudio?.fileName) ||
        'Resolving'
      : 1

  const activeStep = ANALYSIS_PIPELINE_STEPS[activeStepIndex] ?? ANALYSIS_PIPELINE_STEPS[0]

  const progress = Math.min(
    84,
    Math.round(((activeStepIndex + 0.65) / ANALYSIS_PIPELINE_STEPS.length) * 100),
  )

  return (
    <Panel className="overflow-hidden p-0">
      <div className="border-b border-aura-border/8 px-5 py-4 lg:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <EyebrowLabel tone="reveal">Forensic analysis running</EyebrowLabel>
            <h2 className="mt-1 text-lg font-semibold text-aura-text">
              {activeStep.title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-aura-muted">{activeStep.runningText}</p>
          </div>

          <div className="grid gap-2 text-xs text-aura-muted sm:grid-cols-3 lg:min-w-[420px]">
            <Stat label="Mode" value={sourceType} />
            <Stat label="Files expected" value={expectedFiles} />
            <Stat label="Stage" value={`${activeStepIndex + 1} / ${ANALYSIS_PIPELINE_STEPS.length}`} />
          </div>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-aura-bg/45">
          <div
            className="h-full rounded-full bg-aura-reveal transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="grid gap-2 p-4 lg:grid-cols-2 lg:p-5 xl:grid-cols-4">
        {ANALYSIS_PIPELINE_STEPS.map((step, index) => {
          const state: AnalysisStepState =
            index < activeStepIndex ? 'complete' : index === activeStepIndex ? 'running' : 'pending'
          return <AnalysisPipelineStepCard key={step.key} step={step} state={state} />
        })}
      </div>
    </Panel>
  )
}
