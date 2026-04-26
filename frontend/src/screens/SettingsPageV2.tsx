import { CheckCircle2, Lock, LogOut, MoonStar, SlidersHorizontal, SunMedium } from 'lucide-react'
import { Badge, PageHeader, Panel } from '../components/AuraPrimitives'

type Props = {
  theme: 'dark' | 'light'
  onThemeChange: (theme: 'dark' | 'light') => void
  currentUser?: string
  onLogout?: () => void
}

export function SettingsPageV2({
  theme,
  onThemeChange,
  currentUser,
  onLogout,
}: Props) {
  return (
    <div className="h-screen overflow-y-auto px-7 py-6">
      <PageHeader
        title="Settings"
        subtitle="Demo-safe controls for carrier policy, decode display, and analysis detail level."
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <div className="mb-4 text-sm font-semibold text-aura-text">Appearance</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onThemeChange('dark')}
              className={`rounded-xl border p-4 text-left transition-colors ${
                theme === 'dark'
                  ? 'border-aura-accent/30 bg-aura-accentSoft/12'
                  : 'border-aura-border/12 bg-aura-bg/34'
              }`}
            >
              <MoonStar size={17} className="text-aura-text" />
              <div className="mt-3 text-sm font-semibold text-aura-text">Dark</div>
              <div className="mt-1 text-xs leading-5 text-aura-muted">
                Default secure communications palette.
              </div>
            </button>
            <button
              type="button"
              onClick={() => onThemeChange('light')}
              className={`rounded-xl border p-4 text-left transition-colors ${
                theme === 'light'
                  ? 'border-aura-accent/30 bg-aura-accentSoft/12'
                  : 'border-aura-border/12 bg-aura-bg/34'
              }`}
            >
              <SunMedium size={17} className="text-aura-text" />
              <div className="mt-3 text-sm font-semibold text-aura-text">Light</div>
              <div className="mt-1 text-xs leading-5 text-aura-muted">
                High-clarity lab presentation mode.
              </div>
            </button>
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 text-sm font-semibold text-aura-text">Session</div>
          <p className="text-sm leading-6 text-aura-muted">
            Logged in as <span className="font-mono text-aura-text">{currentUser || 'unknown'}</span>.
            Session auth remains cookie-based for local demo use.
          </p>
          {onLogout ? (
            <button
              type="button"
              onClick={onLogout}
              className="mt-5 inline-flex items-center rounded-xl border border-aura-border/12 bg-aura-bg/35 px-4 py-2 text-sm font-semibold text-aura-text transition-colors hover:bg-aura-surface/55"
            >
              <LogOut size={15} className="mr-2" />
              Log out
            </button>
          ) : null}
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-aura-text">
            <Lock size={16} className="text-aura-reveal" />
            Carrier policy
          </div>
          <div className="space-y-3">
            <SettingRow
              title="Dynamic Safe Mode"
              description="Default. Aura selects an approved speech carrier that can safely hold the payload."
              badge="enabled"
              tone="safe"
            />
            <SettingRow
              title="Manual Approved Carrier"
              description="Reserved for controlled demos where the carrier bank item is selected manually."
              badge="disabled"
            />
            <SettingRow
              title="Experimental External Audio"
              description="Not reliable for the current model version. Kept disabled to avoid false capability claims."
              badge="unsafe"
              tone="danger"
            />
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-aura-text">
            <CheckCircle2 size={16} className="text-aura-reveal" />
            Decode display
          </div>
          <div className="space-y-3">
            <SettingRow
              title="Corrected text first"
              description="Show post-processed recovered text as the primary readable result."
              badge="default"
              tone="safe"
            />
            <SettingRow
              title="Raw decoder output"
              description="Keep raw neural output available in a collapsible diagnostic panel."
              badge="enabled"
            />
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-aura-text">
            <SlidersHorizontal size={16} className="text-aura-accent" />
            Analysis detail level
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {['Basic', 'Standard', 'Research'].map((level) => (
              <div
                key={level}
                className={`rounded-xl p-4 ring-1 ${
                  level === 'Standard'
                    ? 'bg-aura-accentSoft/12 text-aura-text ring-aura-accent/18'
                    : 'bg-aura-bg/34 text-aura-muted ring-aura-border/8'
                }`}
              >
                <div className="font-semibold">{level}</div>
                <div className="mt-1 text-xs text-aura-dim">
                  {level === 'Standard' ? 'Default demo mode' : 'Available display profile'}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 text-sm font-semibold text-aura-text">About Aura</div>
          <p className="text-sm leading-6 text-aura-muted">
            Aura is a reliability-first neural audio steganography system for hidden text
            communication inside speech audio. The current demo uses dynamically selected
            approved speech carriers for exact and stable recovery.
          </p>
        </Panel>
      </div>
    </div>
  )
}

function SettingRow({
  title,
  description,
  badge,
  tone = 'neutral',
}: {
  title: string
  description: string
  badge: string
  tone?: 'neutral' | 'safe' | 'accent' | 'danger'
}) {
  return (
    <div className="rounded-xl bg-aura-bg/34 p-4 ring-1 ring-aura-border/8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-aura-text">{title}</div>
          <p className="mt-1 text-sm leading-5 text-aura-muted">{description}</p>
        </div>
        <Badge tone={tone}>{badge}</Badge>
      </div>
    </div>
  )
}
