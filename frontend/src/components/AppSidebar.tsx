import {
  AudioLines,
  MessageSquareMore,
  Radar,
  Settings2,
  Sparkles,
} from 'lucide-react'
import { AuraLogo } from './AuraLogo'
import type { NavKey } from '../types'
import { cn } from '../lib/utils'

const navItems = [
  { key: 'chat', label: 'Chat', icon: MessageSquareMore },
  { key: 'encode', label: 'Encode', icon: Sparkles },
  { key: 'reveal', label: 'Reveal', icon: AudioLines },
  { key: 'analysis', label: 'Analysis', icon: Radar },
  { key: 'settings', label: 'Settings', icon: Settings2 },
] as const

type Props = {
  active: NavKey
  onSelect: (key: NavKey) => void
}

export function AppSidebar({ active, onSelect }: Props) {
  return (
    <aside className="relative flex h-screen w-[275.6px] shrink-0 flex-col border-r border-aura-border/8 bg-[linear-gradient(180deg,rgba(var(--aura-surface),0.985),rgba(var(--aura-surface-soft),0.92))] px-5 py-5 shadow-[10px_0_36px_rgba(0,0,0,0.16)]">
      {/* subtle premium glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_18%_10%,rgba(var(--aura-reveal),0.08),transparent_52%)]" />

      {/* brand */}
      <div className="relative z-10 flex justify-evenly pb-10 pt-3">
        <AuraLogo className="h-auto w-[124px] text-aura-text/95" />
      </div>
      {/* navigation */}
      <nav className="relative z-10 flex flex-col gap-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = active === item.key

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              className={cn(
                'group relative flex h-[54px] items-center gap-3 rounded-2xl px-3.5 text-left transition-all duration-200',
                isActive
                  ? 'bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] text-aura-text shadow-[0_14px_30px_rgba(0,0,0,0.14)] ring-1 ring-white/[0.06]'
                  : 'text-aura-muted hover:bg-white/[0.028] hover:text-aura-text',
              )}
            >
              {/* active accent rail */}
              <span
                className={cn(
                  'absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-full transition-all',
                  isActive
                    ? 'bg-aura-reveal shadow-[0_0_16px_rgba(var(--aura-reveal),0.55)]'
                    : 'bg-transparent',
                )}
              />

              {/* icon container */}
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all',
                  isActive
                    ? 'border-aura-reveal/18 bg-aura-reveal/10 text-aura-reveal shadow-[0_10px_22px_rgba(0,0,0,0.10)]'
                    : 'border-white/[0.04] bg-white/[0.02] text-aura-dim group-hover:border-white/[0.06] group-hover:bg-white/[0.035] group-hover:text-aura-text',
                )}
              >
                <Icon size={18} strokeWidth={1.8} />
              </span>

              {/* text */}
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    'truncate text-[14px] font-medium tracking-[0.01em]',
                    isActive ? 'text-aura-text' : 'text-inherit',
                  )}
                >
                  {item.label}
                </div>
                <div
                  className={cn(
                    'mt-0.5 truncate text-xs leading-5',
                    isActive ? 'text-aura-muted' : 'text-aura-muted/90',
                  )}
                >
                  {getNavSubtitle(item.key)}
                </div>
              </div>

              {/* active glow dot */}
              <span
                className={cn(
                  'h-2 w-2 rounded-full transition-all',
                  isActive
                    ? 'bg-aura-reveal shadow-[0_0_14px_rgba(var(--aura-reveal),0.55)]'
                    : 'bg-transparent',
                )}
              />
            </button>
          )
        })}
      </nav>

      {/* footer */}
      <div className="relative z-10 mt-auto pt-5">
        <div className="rounded-2xl border border-white/[0.04] bg-white/[0.02] px-4 py-3.5">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-aura-muted">
            Aura
          </div>
          <p className="mt-1.5 text-sm leading-5 text-aura-muted/95">
            Neural audio steganography workspace
          </p>
        </div>
      </div>
    </aside>
  )
}

function getNavSubtitle(key: NavKey) {
  switch (key) {
    case 'chat':
      return 'Secure conversations'
    case 'encode':
      return 'Create hidden payloads'
    case 'reveal':
      return 'Recover concealed text'
    case 'analysis':
      return 'Inspect signal evidence'
    case 'settings':
      return 'System preferences'
    default:
      return ''
  }
}