import { BellDot, Search, ShieldCheck } from 'lucide-react'

type Props = {
  title: string
  subtitle: string
}

export function ContextHeader({ title, subtitle }: Props) {
  return (
    <header className="flex flex-col gap-3 border-b border-aura-border/8 pb-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold text-aura-text lg:text-[28px]">
          {title}
        </h1>
        <p className="mt-1 max-w-[620px] truncate text-[14px] leading-6 text-aura-muted">
          {subtitle}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <div className="hidden h-10 items-center gap-2 rounded-2xl border border-aura-border/12 bg-aura-surface/55 px-4 lg:flex">
          <Search size={14} className="text-aura-dim" />
          <span className="text-[13px] text-aura-dim">
            Search transmission history
          </span>
        </div>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-aura-border/12 bg-aura-surface/55 text-aura-muted transition-colors hover:text-aura-text"
          aria-label="Notifications"
        >
          <BellDot size={15} />
        </button>

        <div className="flex h-10 items-center gap-3 rounded-2xl border border-aura-border/12 bg-aura-surface/55 px-3.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-aura-reveal/20 bg-aura-revealSoft text-aura-reveal">
            <ShieldCheck size={13} />
          </div>

          <div className="leading-tight">
            <div className="text-[11px] text-aura-dim">Session Shield</div>
            <div className="font-mono text-[11px] text-aura-text">Verified</div>
          </div>
        </div>
      </div>
    </header>
  )
}
