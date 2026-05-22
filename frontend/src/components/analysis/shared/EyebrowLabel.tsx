import type { ReactNode } from 'react'

type Tone = 'default' | 'reveal' | 'danger'

const toneClasses: Record<Tone, string> = {
  default: 'text-aura-dim/90',
  reveal: 'text-aura-reveal',
  danger: 'text-aura-danger',
}

export function EyebrowLabel({
  children,
  tone = 'default',
}: {
  children: ReactNode
  tone?: Tone
}) {
  return (
    <div className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${toneClasses[tone]}`}>
      {children}
    </div>
  )
}
