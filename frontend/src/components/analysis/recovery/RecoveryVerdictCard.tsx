import { Badge, Panel, Stat } from '../../AuraPrimitives'
import type { AnalysisPayload } from '../types/analysis'
import { formatVerdict, formatNullableBool, cardTitleClass } from '../utils/formatting'
import { verdictTone, subtleIssueMessage } from './recovery.utils'

export function RecoveryVerdictCard({ analysis }: { analysis: AnalysisPayload }) {
  const subtleIssue = subtleIssueMessage(analysis.summary.recoveryStatus)

  return (
    <Panel className="p-5 lg:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={cardTitleClass()}>Recovery verdict</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={verdictTone(analysis.summary.recoveryStatus)}>
              {formatVerdict(analysis.summary.recoveryStatus, Boolean(analysis.summary.recoveredText))}
            </Badge>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-aura-dim">
            Confidence
          </div>
          <div className="mt-1 text-[34px] font-semibold tracking-tight text-aura-text">
            {analysis.summary.recoveryConfidence.toFixed(0)}%
          </div>
          <div className="mt-1 text-sm text-aura-muted">
            Integrity {analysis.summary.integrityScore.toFixed(0)}%
          </div>
        </div>
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-6 text-aura-muted">
        {analysis.summary.trustMessage}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Files" value={`${analysis.summary.filesProcessed} / ${analysis.summary.filesTotal}`} />
        <Stat label="Header" value={formatNullableBool(analysis.summary.headerValid)} />
        <Stat label="Sequence" value={analysis.summary.sequenceValid ? 'Complete' : 'Issue detected'} />
        <Stat label="Corrections" value={String(analysis.summary.correctionsCount)} />
      </div>

      {subtleIssue ? (
        <div className="mt-4 rounded-2xl border border-aura-border/10 bg-aura-bg/28 px-4 py-3 text-sm text-aura-muted">
          {subtleIssue}
        </div>
      ) : null}
    </Panel>
  )
}
