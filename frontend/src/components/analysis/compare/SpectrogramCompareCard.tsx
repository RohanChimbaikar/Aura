import { Panel } from '../../AuraPrimitives'
import { resolveUrl } from '../../../services/api'
import { UnavailablePanel } from '../shared/UnavailablePanel'

export function SpectrogramCompareCard({
  label,
  src,
  available,
}: {
  label: string
  src?: string | null
  available: boolean
}) {
  return (
    <Panel className="overflow-hidden p-0">
      <div className="border-b border-aura-border/8 px-4 py-3 text-xs font-semibold text-aura-muted">
        {label}
      </div>
      {available && src ? (
        <img src={resolveUrl(src)} alt={label} className="aspect-[16/9] w-full object-cover" />
      ) : (
        <UnavailablePanel
          message="Unavailable — cover/stego provenance not found for this item."
          compact={false}
        />
      )}
    </Panel>
  )
}
