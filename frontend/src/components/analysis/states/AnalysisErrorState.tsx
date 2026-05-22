import { Panel } from '../../AuraPrimitives'
import { EyebrowLabel } from '../shared/EyebrowLabel'

export function AnalysisErrorState({ error }: { error: string }) {
  return (
    <Panel className="p-5">
      <EyebrowLabel tone="danger">Analysis failed</EyebrowLabel>
      <h2 className="mt-2 text-xl font-semibold text-aura-text">
        Analysis could not complete
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-aura-muted">{error}</p>
    </Panel>
  )
}
