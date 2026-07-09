import { useState } from 'react'
import { Search, User2, Settings, Key, LogOut, MoreVertical } from 'lucide-react'
import type { User } from '../types'
import { cn } from '../lib/utils'

type Props = {
  currentUser: User
  users: User[]
  selectedRecipient: string
  onSelectRecipient: (username: string) => void
  onlineUsers: Set<string>
  onShowProfile: () => void
  onShowChangePassword: () => void
  onSettingsClick: () => void
  onLogout: () => void
  theme?: 'light' | 'dark'
}

export function ConversationSidebar({
  currentUser,
  users,
  selectedRecipient,
  onSelectRecipient,
  onlineUsers,
  onShowProfile,
  onShowChangePassword,
  onSettingsClick,
  onLogout,
  theme = 'dark',
}: Props) {
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const isDark = theme === 'dark'

  const filteredUsers = users.filter((user) => {
    const term = search.toLowerCase()
    return (
      user.username.toLowerCase().includes(term) ||
      (user.name || '').toLowerCase().includes(term) ||
      (user.email || '').toLowerCase().includes(term)
    )
  })

  return (
    <aside
      className={cn(
        'relative flex h-screen w-[280px] shrink-0 flex-col overflow-hidden border-r',
        isDark ? 'border-white/[0.05] bg-[#0c0f17]' : 'border-black/[0.06] bg-[#eae7df]',
      )}
    >
      {/* Header with Search */}
      <div className="p-4 border-b border-white/[0.04]">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-aura-muted mb-3 px-1">
          Operators Directory
        </h2>
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-full border px-3.5 py-2',
            isDark ? 'border-white/8 bg-white/[0.02]' : 'border-black/10 bg-white/70',
          )}
        >
          <Search size={14} className="text-aura-dim" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search secure nodes..."
            className="w-full bg-transparent text-[13px] text-aura-text outline-none placeholder:text-aura-dim"
          />
        </div>
      </div>

      {/* Directory List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredUsers.length === 0 ? (
          <div className="py-8 text-center text-xs text-aura-dim">
            No active nodes found
          </div>
        ) : (
          filteredUsers.map((user) => {
            const isSelected = selectedRecipient === user.username
            const isOnline = onlineUsers.has(user.username)
            const displayName = user.name || user.username
            const initial = displayName.substring(0, 2).toUpperCase()

            return (
              <button
                key={user.id}
                type="button"
                onClick={() => onSelectRecipient(user.username)}
                className={cn(
                  'group relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all duration-200',
                  isSelected
                    ? isDark
                      ? 'bg-white/[0.06] text-white shadow-inner'
                      : 'bg-white text-black shadow-sm'
                    : isDark
                      ? 'text-white/60 hover:bg-white/[0.025] hover:text-white/90'
                      : 'text-black/70 hover:bg-black/[0.025] hover:text-black/90',
                )}
              >
                {/* Avatar with Presence Indicator */}
                <div className="relative shrink-0">
                  {user.profilePicture ? (
                    <img
                      src={user.profilePicture}
                      alt={displayName}
                      className="h-10 w-10 rounded-full border border-white/8 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-aura-accent/15 to-aura-reveal/15 text-xs font-semibold text-aura-text border border-white/5">
                      {initial}
                    </div>
                  )}
                  {/* Presence Dot */}
                  <span
                    className={cn(
                      'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2',
                      isDark ? 'border-[#0c0f17]' : 'border-[#eae7df]',
                      isOnline ? 'bg-emerald-400' : 'bg-aura-dim',
                    )}
                  />
                </div>

                {/* Name / Email */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-[13.5px] font-medium leading-tight">
                      {displayName}
                    </span>
                  </div>
                  <span className="truncate text-[11px] text-aura-muted block mt-0.5 font-mono">
                    {user.email || `@${user.username}`}
                  </span>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Profile Footer Panel */}
      <div
        className={cn(
          'relative border-t p-3 flex items-center justify-between',
          isDark ? 'border-white/[0.04] bg-[#090c12]' : 'border-black/[0.05] bg-[#dfdcd3]',
        )}
      >
        {/* User Card */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative">
            {currentUser.profilePicture ? (
              <img
                src={currentUser.profilePicture}
                alt={currentUser.name || currentUser.username}
                className="h-9 w-9 rounded-full border border-white/10 object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-aura-accent/20 to-aura-reveal/20 text-xs font-semibold text-aura-text border border-white/8">
                {(currentUser.name || currentUser.username).substring(0, 2).toUpperCase()}
              </div>
            )}
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#090c12] bg-emerald-400" />
          </div>

          <div className="min-w-0">
            <span className="block truncate text-[12.5px] font-semibold text-aura-text">
              {currentUser.name || 'Aura Operator'}
            </span>
            <span className="block truncate text-[10px] text-aura-dim font-mono">
              {currentUser.email || `@${currentUser.username}`}
            </span>
          </div>
        </div>

        {/* Options Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/[0.05] text-aura-muted hover:text-aura-text transition-all"
            aria-label="User actions"
          >
            <MoreVertical size={16} />
          </button>

          {/* User Popover Menu */}
          {menuOpen && (
            <>
              {/* Overlay to close menu */}
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              
              <div
                className={cn(
                  'absolute bottom-9 right-0 z-50 w-44 rounded-xl border p-1 shadow-xl backdrop-blur-xl transition-all duration-200',
                  isDark
                    ? 'border-white/10 bg-[#121622]/90 text-white shadow-black/40'
                    : 'border-black/10 bg-white/95 text-black shadow-black/10',
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onShowProfile()
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-white/[0.06] transition-colors"
                >
                  <User2 size={13} />
                  Profile Details
                </button>

                {/* Show Change Password only if standard credentials account */}
                {!currentUser.googleId && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onShowChangePassword()
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-white/[0.06] transition-colors"
                  >
                    <Key size={13} />
                    Change Password
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onSettingsClick()
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-white/[0.06] transition-colors"
                >
                  <Settings size={13} />
                  Workspace Settings
                </button>

                <div className="h-px bg-white/[0.04] my-1" />

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onLogout()
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-aura-danger hover:bg-aura-danger/10 transition-colors"
                >
                  <LogOut size={13} />
                  Log Out Node
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
