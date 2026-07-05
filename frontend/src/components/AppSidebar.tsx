import {
  AudioLines,
  MessageCircle,
  Radar,
  Settings2,
  Sparkles,
  GitCompare,
} from 'lucide-react'

import { AuraLogo } from './AuraLogo'

import type { NavKey } from '../types'
import { cn } from '../lib/utils'

const navSections = [
  {
    label: 'Workspace',
    items: [
      { key: 'chat', label: 'Chat', icon: MessageCircle, badge: null },
      { key: 'encode', label: 'Encode', icon: Sparkles, badge: 'New' },
      { key: 'reveal', label: 'Decode', icon: AudioLines, badge: null },
    ],
  },
  {
  label: 'Insights',
  items: [
    { key: 'analysis', label: 'Analysis', icon: Radar, badge: null },

    {
      key: 'compare',
      label: 'Compare',
      icon: GitCompare,
      badge: null,
    },
  ],
},
  {
    label: 'System',
    items: [
      { key: 'settings', label: 'Settings', icon: Settings2, badge: null },
    ],
  },
] as const

type Props = {
  active: NavKey
  onSelect: (key: NavKey) => void
  theme?: 'light' | 'dark'
}

export function AppSidebar({
  active,
  onSelect,
  theme = 'dark',
}: Props) {
  const isDark = theme === 'dark'

  return (
    <aside
      className={cn(
        `
        relative flex h-screen w-[188px] shrink-0 flex-col
        overflow-hidden px-3 py-5
        transition-colors duration-300
        `,
        isDark
          ? 'border-r border-white/[0.05] bg-[#080b12]'
          : 'border-r border-black/[0.06] bg-[#f3f1ec]',
      )}
    >
      {/* Atmosphere */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {isDark ? (
          <>
            <div className="absolute -left-16 -top-16 h-[200px] w-[200px] rounded-full bg-cyan-400/[0.06] blur-3xl" />

            <div className="absolute -bottom-20 -left-10 h-[180px] w-[180px] rounded-full bg-blue-500/[0.05] blur-3xl" />

            <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/[0.08] to-transparent" />
          </>
        ) : (
          <>
            <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-black/[0.06] to-transparent" />
          </>
        )}
      </div>

      {/* Logo */}
      <div className="relative z-10 flex justify-center pb-6 pt-2">
        <AuraLogo
          className={cn(
            'h-auto w-[118px]',
            isDark ? 'text-white' : 'text-[#111827]',
          )}
        />
      </div>

      {/* Divider */}
      <div
        className={cn(
          'mx-1 mb-5 h-px',
          isDark ? 'bg-white/[0.04]' : 'bg-black/[0.06]',
        )}
      />

      {/* Navigation */}
      <nav className="relative z-10 flex flex-col gap-0.5">
        {navSections.map((section, si) => (
          <div key={section.label} className={cn(si > 0 && 'mt-4')}>
            {/* Section Label */}
            <p
              className={cn(
                `
                mb-1.5 px-2.5
                text-[9px] font-medium uppercase
                tracking-[0.16em]
                `,
                isDark ? 'text-white/18' : 'text-black/28',
              )}
            >
              {section.label}
            </p>

            {section.items.map((item) => {
              const Icon = item.icon
              const isActive = active === item.key

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onSelect(item.key as NavKey)}
                  className={cn(
                    `
                    group relative flex h-11 w-full items-center
                    gap-2.5 rounded-[14px]
                    px-3 text-left
                    transition-all duration-200
                    `,
                    isActive
                      ? isDark
                        ? `
                          bg-white/[0.055]
                          text-white
                        `
                        : `
                          bg-white/80
                          text-[#111827]
                          shadow-[0_1px_2px_rgba(0,0,0,0.04)]
                        `
                      : isDark
                        ? `
                          text-white/42
                          hover:bg-white/[0.035]
                          hover:text-white/78
                        `
                        : `
                          text-black/48
                          hover:bg-black/[0.04]
                          hover:text-black/78
                        `,
                  )}
                >
                  {/* Active indicator */}
                  <span
                    className={cn(
                      `
                      absolute left-0 top-1/2
                      h-5 w-[2px]
                      -translate-y-1/2 rounded-full
                      transition-opacity duration-200
                      `,
                      isDark ? 'bg-[#74d4eb]' : 'bg-sky-600',
                      isActive ? 'opacity-100' : 'opacity-0',
                    )}
                  />

                  {/* Icon */}
                  <Icon
                    size={17}
                    strokeWidth={1.9}
                    className={cn(
                      `
                      shrink-0 transition-colors duration-200
                      `,
                      isActive
                        ? isDark
                          ? 'text-[#74d4eb]'
                          : 'text-sky-700'
                        : isDark
                          ? 'text-white/28 group-hover:text-white/70'
                          : 'text-black/34 group-hover:text-black/70',
                    )}
                  />

                  {/* Label */}
                  <span
                    className={cn(
                      `
                      text-[14px]
                      tracking-[-0.01em]
                      `,
                      isActive ? 'font-medium' : 'font-normal',
                    )}
                  >
                    {item.label}
                  </span>

                  {/* Badge */}
                  {item.badge && (
                    <span
                      className={cn(
                        `
                        ml-auto rounded-full
                        px-1.5 py-px
                        font-mono text-[9px]
                        `,
                        isDark
                          ? 'bg-cyan-400/[0.10] text-cyan-300/80'
                          : 'bg-sky-500/[0.08] text-sky-700',
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className={cn(
          `
          relative z-10 mt-auto overflow-hidden
          rounded-[20px] p-4
          `,
          isDark
            ? `
              border border-white/[0.05]
              bg-white/[0.025]
              backdrop-blur-xl
            `
            : `
              border border-black/[0.05]
              bg-white/75
            `,
        )}
      >
        {/* subtle glow */}
        {isDark && (
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(116,212,235,0.08),transparent_55%)]" />
        )}

        <div className="relative z-10 flex items-center justify-between">
          <span
            className={cn(
              `
              font-mono text-[9px]
              uppercase tracking-[0.22em]
              `,
              isDark
                ? 'text-cyan-300/65'
                : 'text-sky-700/70',
            )}
          >
            Aura V2-R
          </span>

          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_2px_rgba(52,211,153,0.16)]" />
        </div>

        <p
          className={cn(
            `
            relative z-10 mt-2
            text-[12px] leading-relaxed
            `,
            isDark
              ? 'text-white/38'
              : 'text-black/48',
          )}
        >
          Neural audio recovery
        </p>
      </div>
    </aside>
  )
}