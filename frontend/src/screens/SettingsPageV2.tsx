import { MoonStar, SunMedium, LogOut, Key, User, ShieldCheck, Info } from 'lucide-react'
import { Badge, PageHeader, Panel, Stat } from '../components/AuraPrimitives'
import type { User as UserType } from '../types'

type Props = {
  theme: 'dark' | 'light'
  onThemeChange: (theme: 'dark' | 'light') => void
  currentUser: UserType
  onLogout: () => void
  onChangePasswordClick: () => void
}

export function SettingsPageV2({
  theme,
  onThemeChange,
  currentUser,
  onLogout,
  onChangePasswordClick,
}: Props) {
  const isGoogle = Boolean(currentUser.googleId)
  const registryDate = currentUser.createdAt
    ? new Date(currentUser.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : 'Unknown'

  return (
    <div className="h-screen overflow-y-auto px-7 py-6">
      <PageHeader
        title="Workspace Settings"
        subtitle="Manage your operator profile, appearance options, and active secure session configurations."
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Account Settings Panel */}
        <Panel className="flex flex-col justify-between">
          <div>
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-aura-text border-b border-white/5 pb-2">
              <User size={16} className="text-aura-accent" />
              Account Settings
            </div>
            
            <div className="flex items-center gap-4 mb-5">
              {currentUser.profilePicture ? (
                <img
                  src={currentUser.profilePicture}
                  alt={currentUser.name || currentUser.username}
                  className="h-14 w-14 rounded-full border border-aura-accent/30 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-aura-accent/20 to-aura-reveal/20 text-lg font-semibold text-aura-text border border-white/8">
                  {(currentUser.name || currentUser.username).substring(0, 2).toUpperCase()}
                </div>
              )}

              <div>
                <h3 className="text-[15px] font-semibold text-aura-text">
                  {currentUser.name || 'Aura Operator'}
                </h3>
                <p className="text-xs text-aura-muted">@{currentUser.username}</p>
              </div>
            </div>

            <div className="space-y-3.5 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-aura-muted">Email</span>
                <span className="font-mono text-aura-text text-[13px]">{currentUser.email || 'Not configured'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-aura-muted">Registry Node</span>
                <span className="text-aura-text">{registryDate}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-aura-muted">Linked Identity</span>
                <div>
                  {isGoogle ? (
                    <Badge tone="safe">Google OAuth</Badge>
                  ) : (
                    <Badge tone="accent">Email / Password</Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {!isGoogle && (
            <button
              type="button"
              onClick={onChangePasswordClick}
              className="mt-6 flex items-center justify-center gap-2 w-full rounded-xl border border-aura-border/12 bg-aura-bg/35 hover:bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-aura-text transition-all"
            >
              <Key size={14} />
              Change Operator Password
            </button>
          )}
        </Panel>

        {/* Session Panel */}
        <Panel className="flex flex-col justify-between">
          <div>
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-aura-text border-b border-white/5 pb-2">
              <ShieldCheck size={16} className="text-aura-reveal" />
              Active Session
            </div>
            
            <p className="text-xs leading-5 text-aura-muted mb-4">
              Your console session uses standard secure JSON Web Token cookies. Expired tokens are refreshed dynamically on demand.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Current Node" value={currentUser.username} />
              <Stat label="Login Type" value={isGoogle ? 'Google Sign-In' : 'Email/Password'} />
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="mt-6 flex items-center justify-center gap-2 w-full rounded-xl border border-aura-danger/24 bg-aura-danger/10 hover:bg-aura-danger/18 px-4 py-2.5 text-xs font-semibold text-aura-danger transition-all"
          >
            <LogOut size={14} />
            Log Out Console Session
          </button>
        </Panel>

        {/* Appearance Panel */}
        <Panel>
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-aura-text border-b border-white/5 pb-2">
            <SunMedium size={16} className="text-aura-accent" />
            Appearance
          </div>
          
          <p className="text-xs leading-5 text-aura-muted mb-4">
            Toggle the styling theme of the steganographic forensic interface.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onThemeChange('dark')}
              className={`rounded-xl border p-4 text-left transition-all ${
                theme === 'dark'
                  ? 'border-aura-accent/30 bg-aura-accentSoft/12 shadow-[0_4px_12px_rgba(0,0,0,0.12)]'
                  : 'border-aura-border/12 bg-aura-bg/34 hover:bg-white/[0.02]'
              }`}
            >
              <MoonStar size={17} className="text-aura-text" />
              <div className="mt-2 text-sm font-semibold text-aura-text">Dark Mode</div>
              <div className="mt-1 text-[11px] leading-4 text-aura-muted">
                Default secure dark communications environment.
              </div>
            </button>
            <button
              type="button"
              onClick={() => onThemeChange('light')}
              className={`rounded-xl border p-4 text-left transition-all ${
                theme === 'light'
                  ? 'border-aura-accent/30 bg-aura-accentSoft/12 shadow-[0_4px_12px_rgba(0,0,0,0.04)]'
                  : 'border-aura-border/12 bg-aura-bg/34 hover:bg-white/[0.02]'
              }`}
            >
              <SunMedium size={17} className="text-aura-text" />
              <div className="mt-2 text-sm font-semibold text-aura-text">Light Mode</div>
              <div className="mt-1 text-[11px] leading-4 text-aura-muted">
                High-contrast lab demonstration theme.
              </div>
            </button>
          </div>
        </Panel>

        {/* About Aura Panel */}
        <Panel className="flex flex-col justify-between">
          <div>
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-aura-text border-b border-white/5 pb-2">
              <Info size={16} className="text-aura-reveal" />
              About Aura
            </div>
            
            <p className="text-sm leading-6 text-aura-muted">
              Aura is an AI-powered audio steganography platform that securely embeds and recovers hidden text within speech audio using deep learning models. It provides reliable encoding, decoding, and analysis tools through an intuitive interface designed for research and demonstration purposes.
            </p>
          </div>

          <div className="mt-6 flex justify-between items-center text-[10px] text-aura-dim font-mono border-t border-white/5 pt-3">
            <span>Aura Node V2-R</span>
            <span>Secure Speech Engine Active</span>
          </div>
        </Panel>
      </div>
    </div>
  )
}
