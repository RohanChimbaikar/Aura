import { Panel } from '../../AuraPrimitives'

export function AnalysisErrorState({ error }: { error: string }) {
  return (
    <Panel className="p-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aura-danger">
        Analysis failed
      </div>
      <h2 className="mt-2 text-xl font-semibold text-aura-text">
        Analysis could not complete
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-aura-muted">{error}</p>
    </Panel>
  )
}
