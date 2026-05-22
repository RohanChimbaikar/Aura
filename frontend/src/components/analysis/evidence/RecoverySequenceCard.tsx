import { Badge } from '../../AuraPrimitives'
import { cn } from '../../../lib/utils'
import { EvidenceCard } from '../shared/EvidenceCard'
import type { AnalysisPayload } from '../types/analysis'

export function RecoverySequenceCard({
  items,
}: {
  items: AnalysisPayload['charts']['sequenceProgress']
}) {
  return (
    <EvidenceCard
      title="Recovery Sequence"
      subtitle="Ordered transmission state across the recovered sequence."
      className="xl:col-span-1"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {items.map((item) => (
          <div
            key={item.partNumber}
            className="rounded-2xl border border-aura-border/8 bg-aura-bg/24 px-3 py-3 transition-colors hover:border-aura-border/14"
          >
            <div className="text-xs text-aura-muted">Part {item.partNumber}</div>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  item.status === 'complete'
                    ? 'bg-aura-reveal'
                    : item.status === 'corrected'
                      ? 'bg-aura-accent'
                      : item.status === 'missing' || item.status === 'duplicate'
                        ? 'bg-aura-danger'
                        : 'bg-aura-dim',
                )}
              />
              <Badge
                tone={
                  item.status === 'missing' || item.status === 'duplicate'
                    ? 'danger'
                    : item.status === 'corrected' || item.status === 'processing'
                      ? 'accent'
                      : 'safe'
                }
              >
                {item.status.replace('_', ' ')}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </EvidenceCard>
  )
}
