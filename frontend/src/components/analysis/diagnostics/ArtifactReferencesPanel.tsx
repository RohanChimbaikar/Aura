import { Panel } from '../../AuraPrimitives'
import type { AnalysisPayload } from '../types/analysis'
import { cardTitleClass } from '../utils/formatting'

export function ArtifactReferencesPanel({ analysis }: { analysis: AnalysisPayload }) {
  const corrections = analysis.recovery.changes

  return (
    <Panel className="p-4">
      <div className={cardTitleClass()}>Artifact references</div>
      <div className="mt-3 space-y-2 text-sm leading-6 text-aura-muted">
        <p>Provenance assets linked: {analysis.provenance.assets.length}.</p>
        <p>Compare artifacts available: {analysis.charts.compareSpectrogram?.available ? 'yes' : 'no'}.</p>
        <p>Corrections listed: {corrections.length ? corrections.length : 0}.</p>
      </div>
    </Panel>
  )
}
