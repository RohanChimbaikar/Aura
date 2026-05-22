import { Stat } from '../../AuraPrimitives'
import type { AnalysisPayload } from '../types/analysis'

export function AnalysisSummaryBanner({
  analysis,
  successLike,
}: {
  analysis: AnalysisPayload
  successLike: boolean
}) {
  const normalizedStatus = (analysis.status || '').toLowerCase()

  const title = successLike
    ? 'Analysis completed successfully'
    : normalizedStatus === 'failed'
      ? 'Analysis completed with issues'
      : 'Analysis completed'

  const message =
    analysis.message ||
    analysis.reason ||
    analysis.summary?.trustMessage ||
    (successLike
      ? 'Aura produced a renderable forensic object and the analysis page is showing all available evidence.'
      : 'Aura returned a partial or reduced forensic object. Available evidence is shown below.')

  const processed = analysis.filesProcessed ?? analysis.summary?.filesProcessed ?? '\u2014'
  const total = analysis.filesTotal ?? analysis.summary?.filesTotal ?? '\u2014'

  return (
    <div className="rounded-2xl border border-aura-reveal/14 bg-aura-reveal/8 px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aura-reveal">
            Analysis status
          </div>
          <div className="mt-1 text-sm font-semibold text-aura-text">{title}</div>
          <p className="mt-1 text-sm leading-6 text-aura-muted">{message}</p>
        </div>

        <div className="grid gap-2 text-xs text-aura-muted sm:grid-cols-3 lg:min-w-[420px]">
          <Stat label="Status" value={analysis.status || 'completed'} />
          <Stat label="Files" value={`${processed} / ${total}`} />
          <Stat
            label="Elapsed"
            value={analysis.elapsedMs ? `${(analysis.elapsedMs / 1000).toFixed(1)}s` : '\u2014'}
          />
        </div>
      </div>

      {(analysis.missingParts?.length ?? 0) > 0 ? (
        <div className="mt-3 rounded-2xl border border-aura-danger/20 bg-aura-danger/10 px-4 py-3 text-sm text-aura-danger">
          Missing {analysis.missingParts?.map((part) => `Part ${part}`).join(', ')}
        </div>
      ) : null}
    </div>
  )
}
