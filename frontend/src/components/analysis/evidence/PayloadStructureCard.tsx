import { EvidenceCard } from '../shared/EvidenceCard'
import type { AnalysisPayload } from '../types/analysis'

export function PayloadStructureCard({
  structure,
}: {
  structure: AnalysisPayload['charts']['payloadStructure']
}) {
  const total = Math.max(
    1,
    structure.headerBlocks +
      structure.payloadBlocks +
      structure.redundancyBlocks +
      structure.ignoredTailBlocks +
      structure.duplicateBlocks,
  )
  const segments = [
    { label: 'Header', value: structure.headerBlocks, color: 'rgb(var(--aura-accent))' },
    { label: 'Payload', value: structure.payloadBlocks, color: 'rgb(var(--aura-reveal))' },
    { label: 'Redundancy', value: structure.redundancyBlocks, color: 'rgba(148,163,184,0.75)' },
    { label: 'Ignored tail', value: structure.ignoredTailBlocks, color: 'rgba(249,115,22,0.85)' },
    { label: 'Duplicates', value: structure.duplicateBlocks, color: 'rgba(239,68,68,0.9)' },
  ]

  return (
    <EvidenceCard
      title="Payload Structure"
      subtitle="Header, payload, redundancy, ignored tail, and duplicate composition."
    >
      <div className="flex h-4 overflow-hidden rounded-full bg-aura-bg/35">
        {segments.map((segment) =>
          segment.value > 0 ? (
            <div
              key={segment.label}
              style={{ width: `${(segment.value / total) * 100}%`, background: segment.color }}
              title={`${segment.label}: ${segment.value}`}
            />
          ) : null,
        )}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between text-sm">
            <span className="text-aura-muted">{segment.label}</span>
            <span className="text-aura-text">{segment.value}</span>
          </div>
        ))}
      </div>
    </EvidenceCard>
  )
}
