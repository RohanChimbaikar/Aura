import { Panel } from '../../AuraPrimitives'
import { EyebrowLabel } from '../shared/EyebrowLabel'
import { DenseKeyValue } from '../shared/DenseKeyValue'

export function EmptyResolvedAnalysisState({
  status,
  onRetry,
  retryDisabled,
}: {
  status: string
  onRetry: () => Promise<void> | void
  retryDisabled: boolean
}) {
  return (
    <Panel className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <EyebrowLabel>Analysis completed</EyebrowLabel>
          <h2 className="mt-2 text-xl font-semibold text-aura-text">
            No analysis payload was returned
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-aura-muted">
            Aura finished the request, but the backend did not return a usable analysis object for this item.
            This usually means the backend settled without producing a renderable payload.
          </p>
        </div>

        <div className="rounded-2xl border border-aura-border/10 bg-aura-bg/35 px-4 py-3 text-sm text-aura-muted">
          <DenseKeyValue label="Status" value={status} />
          <DenseKeyValue label="State" value="No payload" className="mt-1" />
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
