import { Check, Circle, Loader2, Minus } from 'lucide-react'
import type { AnalysisPipelineStep, AnalysisStepState } from '../types/analysis'

export function AnalysisPipelineStepCard({
  step,
  state,
}: {
  step: AnalysisPipelineStep
  state: AnalysisStepState
}) {
  const icon =
    state === 'complete' ? (
      <Check size={14} />
    ) : state === 'running' ? (
      <Loader2 size={14} className="animate-spin" />
    ) : state === 'skipped' ? (
      <Minus size={14} />
    ) : (
      <Circle size={14} />
    )

  return (
    <div
      className={[
        'rounded-2xl border px-4 py-3 transition-all duration-300',
        state === 'running'
          ? 'border-aura-reveal/24 bg-aura-reveal/10 shadow-[0_0_24px_rgba(114,209,199,0.10)]'
          : state === 'complete'
            ? 'border-aura-reveal/14 bg-aura-bg/30'
            : 'border-aura-border/8 bg-aura-bg/20 opacity-70',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span
          className={[
            'inline-flex h-7 w-7 items-center justify-center rounded-full border',
            state === 'running'
              ? 'border-aura-reveal/25 bg-aura-reveal/12 text-aura-reveal'
              : state === 'complete'
                ? 'border-aura-reveal/18 bg-aura-reveal/10 text-aura-reveal'
                : 'border-aura-border/10 bg-aura-bg/35 text-aura-dim',
          ].join(' ')}
        >
          {icon}
        </span>

        <div className="text-sm font-semibold text-aura-text">{step.title}</div>
      </div>

      <p className="mt-2 text-xs leading-5 text-aura-muted">{step.caption}</p>
    </div>
  )
}
