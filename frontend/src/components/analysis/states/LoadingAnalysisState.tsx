import { Panel } from '../../AuraPrimitives'

export function LoadingAnalysisState() {
  return (
    <Panel className="space-y-4 p-6">
      <div className="h-5 w-40 animate-pulse rounded bg-aura-bg/45" />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-52 animate-pulse rounded-2xl bg-aura-bg/40" />
        <div className="h-52 animate-pulse rounded-2xl bg-aura-bg/40" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="h-64 animate-pulse rounded-2xl bg-aura-bg/40" />
        <div className="h-64 animate-pulse rounded-2xl bg-aura-bg/40" />
        <div className="h-64 animate-pulse rounded-2xl bg-aura-bg/40" />
      </div>
    </Panel>
  )
}
