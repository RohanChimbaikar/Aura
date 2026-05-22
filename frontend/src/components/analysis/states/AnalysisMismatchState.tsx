import { Panel } from '../../AuraPrimitives'
import type { AnalysisPayload, SelectedAudio } from '../types/analysis'
import { EyebrowLabel } from '../shared/EyebrowLabel'

export function AnalysisMismatchState({
  analysis,
  selectedAudio,
  onRetry,
  retryDisabled,
}: {
  analysis: AnalysisPayload
  selectedAudio: SelectedAudio | null
  onRetry: () => Promise<void> | void
  retryDisabled: boolean
}) {
  const selectedFile = selectedAudio?.selectedPartFilename || selectedAudio?.fileName || 'Unknown'
  const analysisTarget =
    analysis.selectedPartFilename ||
    analysis.transmissionId ||
    analysis.analysisId ||
    'Unknown'

  return (
    <Panel className="p-5">
      <EyebrowLabel>Analysis returned</EyebrowLabel>
      <h2 className="mt-2 text-xl font-semibold text-aura-text">
        Analysis completed, but target mapping did not align
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-aura-muted">
        Aura returned an analysis object, but the frontend could not confidently map it to the currently selected audio.
        This is usually a grouped-vs-single target identity mismatch, not a backend failure.
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-aura-border/10 bg-aura-bg/35 px-4 py-3 text-sm text-aura-muted">
          <EyebrowLabel>Selected audio</EyebrowLabel>
          <div className="mt-2 text-aura-text">{selectedFile}</div>
        </div>

        <div className="rounded-2xl border border-aura-border/10 bg-aura-bg/35 px-4 py-3 text-sm text-aura-muted">
          <EyebrowLabel>Analysis target</EyebrowLabel>
          <div className="mt-2 text-aura-text">{analysisTarget}</div>
        </div>
      </div>

      <button
        type="button"
        onClick={onRetry}
        disabled={retryDisabled}
        className="mt-5 rounded-2xl border border-aura-reveal/18 bg-aura-reveal/10 px-5 py-2.5 text-sm font-semibold text-aura-reveal transition-all hover:bg-aura-reveal/14 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Retry analysis
      </button>
    </Panel>
  )
}
