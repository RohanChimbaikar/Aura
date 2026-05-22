import { Panel } from '../../AuraPrimitives'
import type { AnalysisPayload } from '../types/analysis'
import { EyebrowLabel } from '../shared/EyebrowLabel'
import { DenseKeyValue } from '../shared/DenseKeyValue'

export function TerminalAnalysisState({
  analysis,
  onRetry,
  retryDisabled,
}: {
  analysis: AnalysisPayload
  onRetry: () => Promise<void> | void
  retryDisabled: boolean
}) {
  const titleByStatus: Record<string, string> = {
    partial: 'Partial analysis completed',
    failed: 'Analysis failed',
    timed_out: 'Analysis timed out',
    invalid_target: 'Invalid analysis target',
    missing_source: 'Missing source audio',
    not_found: 'Analysis target not found',
    cancelled: 'Analysis cancelled',
    complete: 'Analysis completed',
    completed: 'Analysis completed',
  }

  const status = analysis.status
  const reason =
    analysis.reason ||
    analysis.message ||
    analysis.summary?.trustMessage ||
    'Analysis reached a terminal non-success state.'

  const missingParts = analysis.missingParts ?? []
  const processed = analysis.filesProcessed ?? analysis.summary?.filesProcessed ?? '\u2014'
  const total = analysis.filesTotal ?? analysis.summary?.filesTotal ?? '\u2014'

  return (
    <Panel className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <EyebrowLabel>Analysis status</EyebrowLabel>
          <h2 className="mt-2 text-xl font-semibold text-aura-text">
            {titleByStatus[status] ?? status}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-aura-muted">{reason}</p>
          {analysis.errorCode ? (
            <div className="mt-3 font-mono text-xs text-aura-dim">{analysis.errorCode}</div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-aura-border/10 bg-aura-bg/35 px-4 py-3 text-sm text-aura-muted">
          <DenseKeyValue label="Status" value={status} />
          <DenseKeyValue label="Files" value={`${processed} / ${total}`} className="mt-1" />
          {analysis.elapsedMs ? (
            <DenseKeyValue label="Elapsed" value={`${(analysis.elapsedMs / 1000).toFixed(1)}s`} className="mt-1" />
          ) : null}
        </div>
      </div>

      {missingParts.length ? (
        <div className="mt-4 rounded-2xl border border-aura-danger/20 bg-aura-danger/10 px-4 py-3 text-sm text-aura-danger">
          Missing {missingParts.map((part) => `Part ${part}`).join(', ')}
        </div>
      ) : null}

      {analysis.summary?.recoveredText ? (
        <div className="mt-4 rounded-2xl border border-aura-reveal/16 bg-aura-reveal/8 p-4">
          <EyebrowLabel tone="reveal">Partial recovered text</EyebrowLabel>
          <p className="mt-2 text-base font-semibold leading-7 text-aura-text">
            {analysis.summary.recoveredText}
          </p>
        </div>
      ) : null}

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
