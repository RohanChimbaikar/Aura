import { cn } from '../lib/utils'

type Tone = 'accent' | 'reveal' | 'neutral' | 'warm'

type Props = {
  label: string
  tone?: Tone
}

const toneClass: Record<Tone, string> = {
  accent: 'border-aura-accent/18 bg-aura-accentSoft/12 text-aura-accent',
  reveal: 'border-aura-reveal/18 bg-aura-revealSoft/14 text-aura-reveal',
  neutral: 'border-aura-border/10 bg-aura-surface/45 text-aura-muted',
  warm: 'border-aura-danger/15 bg-aura-danger/10 text-aura-danger',
}

export function StatusBadge({ label, tone = 'neutral' }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 font-mono text-[11px]',
        toneClass[tone],
      )}
    >
      {label}
    </span>
  )
}
