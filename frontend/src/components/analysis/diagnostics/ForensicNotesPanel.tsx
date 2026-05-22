import { Panel } from '../../AuraPrimitives'
import type { AnalysisPayload } from '../types/analysis'
import { formatNullableBool, cardTitleClass } from '../utils/formatting'

export function ForensicNotesPanel({ analysis }: { analysis: AnalysisPayload }) {
  return (
    <Panel className="p-4">
      <div className={cardTitleClass()}>Forensic notes</div>
      <div className="mt-3 space-y-2 text-sm leading-6 text-aura-muted">
        <p>Header validation: {formatNullableBool(analysis.summary.headerValid)}.</p>
        <p>Sequence anomalies: {analysis.summary.sequenceValid ? 'none detected' : 'present'}.</p>
        <p>Ignored tail blocks: {analysis.summary.ignoredTail}.</p>
        <p>
          Corrections applied: {analysis.summary.correctionsApplied ? `${analysis.summary.correctionsCount} chunk adjustments recorded.` : 'none recorded.'}
        </p>
      </div>
    </Panel>
  )
}
