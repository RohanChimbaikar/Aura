import type { ReactNode } from 'react'

import { cn } from '../../../lib/utils'

type MetricTone =
  | 'safe'
  | 'neutral'
  | 'warning'
  | 'danger'

type Props = {
  children: ReactNode
  tone: MetricTone
}

export function OutcomeBadge({
  children,
  tone,
}: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]',

        tone === 'safe' &&
          'border-aura-reveal/20 bg-aura-reveal/12 text-aura-reveal',

        tone === 'warning' &&
          'border-aura-accent/20 bg-aura-accent/12 text-aura-text',

        tone === 'danger' &&
          'border-aura-danger/20 bg-aura-danger/12 text-aura-danger',

        tone === 'neutral' &&
          'border-aura-border/12 bg-aura-surfaceSoft text-aura-muted',
      )}
    >
      {children}
    </span>
  )
}