import { Copy } from 'lucide-react'
import { Panel, Stat } from '../../AuraPrimitives'
import type { AnalysisPayload } from '../types/analysis'
import { cardTitleClass, cardSubtitleClass } from '../utils/formatting'
import { recoveryNote } from './recovery.utils'

export function RecoveredMessageCard({
  analysis,
  recoveredText,
}: {
  analysis: AnalysisPayload
  recoveredText: string
}) {
  const note = recoveryNote(analysis.summary.recoveryStatus)

  return (
    <Panel className="p-5 lg:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={cardTitleClass()}>Recovered message</div>
          {note ? <div className={cardSubtitleClass()}>{note}</div> : null}
        </div>
        {recoveredText ? (
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(recoveredText)}
            className="inline-flex items-center rounded-xl border border-aura-border/10 bg-aura-bg/35 px-3 py-2 text-sm font-semibold text-aura-text transition-colors hover:bg-aura-bg/50"
          >
            <Copy size={14} className="mr-2" />
            Copy
          </button>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-aura-border/8 bg-aura-bg/24 px-4 py-4 lg:px-5 lg:py-5">
        <p className="whitespace-pre-wrap break-words text-[20px] leading-9 text-aura-text lg:text-[22px]">
          {recoveredText || 'No recoverable hidden text detected.'}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Total chunks" value={String(analysis.summary.payloadChunks)} />
        <Stat label="Ignored tail" value={String(analysis.summary.ignoredTail)} />
        <Stat
          label="Missing / duplicate"
          value={`${analysis.summary.missingPartsCount} / ${analysis.summary.duplicatePartsCount}`}
        />
      </div>
    </Panel>
  )
}
