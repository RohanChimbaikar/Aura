import { MoonStar, LogOut, SunMedium } from 'lucide-react'
import { SecondaryActionButton } from '../components/ActionButtons'
import { SurfacePanel } from '../components/SurfacePanel'

type Props = {
  theme: 'dark' | 'light'
  onThemeChange: (theme: 'dark' | 'light') => void
  currentUser?: string
  onLogout?: () => void
}

export function SettingsScreen({
  theme,
  onThemeChange,
  currentUser,
  onLogout,
}: Props) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <SurfacePanel className="p-6">
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
          Appearance
        </div>
        <div className="mt-2 text-[18px] font-medium text-aura-text">
          Interface atmosphere
        </div>
        <p className="mt-3 max-w-[520px] text-sm leading-6 text-aura-muted">
          Keep the communication layer visually aligned with the rest of Aura while
          switching between light and dark field conditions.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onThemeChange('dark')}
            className={`rounded-[24px] border p-5 text-left transition-colors ${
              theme === 'dark'
                ? 'border-aura-accent/30 bg-aura-accentSoft/12'
                : 'border-aura-border/16 bg-aura-surface/35'
            }`}
          >
            <MoonStar size={18} className="text-aura-text" />
            <div className="mt-4 text-sm font-medium text-aura-text">Dark</div>
            <div className="mt-1 text-sm text-aura-muted">
              Default Aura control room palette.
            </div>
          </button>

          <button
            type="button"
            onClick={() => onThemeChange('light')}
            className={`rounded-[24px] border p-5 text-left transition-colors ${
              theme === 'light'
                ? 'border-aura-accent/30 bg-aura-accentSoft/12'
                : 'border-aura-border/16 bg-aura-surface/35'
            }`}
          >
            <SunMedium size={18} className="text-aura-text" />
            <div className="mt-4 text-sm font-medium text-aura-text">Light</div>
            <div className="mt-1 text-sm text-aura-muted">
              High-clarity lab presentation mode.
            </div>
          </button>
        </div>
      </SurfacePanel>

      <SurfacePanel className="p-6">
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
          Session
        </div>
        <div className="mt-2 text-[18px] font-medium text-aura-text">
          Active operator
        </div>
        <p className="mt-3 text-sm leading-6 text-aura-muted">
          Logged in as {currentUser || 'unknown user'}. Session auth is cookie-based
          for local demo use.
        </p>

        {onLogout ? (
          <SecondaryActionButton type="button" onClick={onLogout} className="mt-6">
            <LogOut size={15} className="mr-2" />
            Log out
          </SecondaryActionButton>
        ) : null}
      </SurfacePanel>
    </div>
  )
}
