import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

export function Panel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'rounded-2xl bg-aura-surface/78 p-5 shadow-[0_18px_44px_rgba(0,0,0,0.16)] ring-1 ring-aura-border/8',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'safe' | 'accent' | 'danger'
}) {
  const tones = {
    neutral: 'border-aura-border/10 bg-aura-bg/35 text-aura-muted',
    safe: 'border-aura-reveal/18 bg-aura-reveal/10 text-aura-reveal',
    accent: 'border-aura-accent/20 bg-aura-accentSoft/12 text-aura-text',
    danger: 'border-aura-danger/24 bg-aura-danger/10 text-aura-danger',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold',
        tones[tone],
      )}
    >
      {children}
    </span>
  )
}

export function Stat({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="rounded-xl bg-aura-bg/34 px-4 py-3 ring-1 ring-aura-border/7">
      <div className="text-[11px] text-aura-dim">{label}</div>
      <div className="mt-1 font-mono text-sm text-aura-text">{value}</div>
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <header className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-semibold text-aura-text">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-aura-muted">{subtitle}</p>
      </div>
    </header>
  )
}
