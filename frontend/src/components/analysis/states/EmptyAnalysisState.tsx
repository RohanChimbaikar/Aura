import { Panel } from '../../AuraPrimitives'
import { cardTitleClass } from '../utils/formatting'

export function EmptyAnalysisState() {
  return (
    <Panel className="p-6 lg:p-8">
      <div className="max-w-xl">
        <div className={cardTitleClass()}>Forensic analysis</div>
        <p className="mt-3 text-sm leading-6 text-aura-muted">
          Select an audio or recovered transmission to inspect forensic analysis.
        </p>
      </div>
    </Panel>
  )
}
