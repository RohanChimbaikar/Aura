import { useEffect, useRef, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Check } from 'lucide-react'
import type { User } from '../types'
import { cn } from '../lib/utils'

type Props = {
  isOpen: boolean
  onClose: () => void
  users: User[]
  onlineUsers: Set<string>
  recentUsers: string[]
  selectedRecipient?: string
  onConfirm: (username: string) => void
}

export function RecipientModal({
  isOpen,
  onClose,
  users,
  onlineUsers,
  recentUsers,
  selectedRecipient,
  onConfirm,
}: Props) {
  const [search, setSearch] = useState('')
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  
  const listContainerRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Filter users based on search query
  const filteredUsers = useMemo(() => {
    const term = search.toLowerCase().trim()
    return users.filter((user) => {
      if (!term) return true
      return (
        user.username.toLowerCase().includes(term) ||
        (user.name || '').toLowerCase().includes(term) ||
        (user.email || '').toLowerCase().includes(term)
      )
    })
  }, [users, search])

  // Group filtered users into Recent vs All Other
  const { recentFiltered, allOtherFiltered } = useMemo(() => {
    const recentSet = new Set(recentUsers)
    const recent: User[] = []
    const other: User[] = []

    const recentMap = new Map(recentUsers.map((username, idx) => [username, idx]))
    
    filteredUsers.forEach((user) => {
      if (recentSet.has(user.username)) {
        recent.push(user)
      } else {
        other.push(user)
      }
    })

    recent.sort((a, b) => {
      const idxA = recentMap.get(a.username) ?? 9999
      const idxB = recentMap.get(b.username) ?? 9999
      return idxA - idxB
    })

    return { recentFiltered: recent, allOtherFiltered: other }
  }, [filteredUsers, recentUsers])

  // Flat list of items in display order for easy indexing
  const orderedDisplayList = useMemo(() => {
    return [...recentFiltered, ...allOtherFiltered]
  }, [recentFiltered, allOtherFiltered])

  // Initialize and reset selections
  useEffect(() => {
    if (isOpen) {
      setSearch('')
      if (selectedRecipient && users.some((u) => u.username === selectedRecipient)) {
        setSelectedUsername(selectedRecipient)
        const initialDisplayList = [
          ...users.filter((u) => recentUsers.includes(u.username)).sort((a, b) => {
            const idxA = recentUsers.indexOf(a.username)
            const idxB = recentUsers.indexOf(b.username)
            return idxA - idxB
          }),
          ...users.filter((u) => !recentUsers.includes(u.username)),
        ]
        const idx = initialDisplayList.findIndex((u) => u.username === selectedRecipient)
        setSelectedIndex(idx)
      } else {
        setSelectedUsername(null)
        setSelectedIndex(-1)
      }
      
      const timer = setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isOpen, selectedRecipient, users, recentUsers])

  useEffect(() => {
    setSelectedIndex(-1)
    setSelectedUsername(null)
  }, [search])

  // Scroll selected item into view
  useEffect(() => {
    if (!listContainerRef.current) return
    const container = listContainerRef.current
    const activeElement = container.querySelector('[data-active="true"]') as HTMLElement | null
    if (!activeElement) return

    const containerTop = container.scrollTop
    const containerBottom = containerTop + container.clientHeight
    const elemTop = activeElement.offsetTop
    const elemBottom = elemTop + activeElement.clientHeight

    if (elemTop < containerTop) {
      container.scrollTop = elemTop
    } else if (elemBottom > containerBottom) {
      container.scrollTop = elemBottom - container.clientHeight
    }
  }, [selectedIndex])

  // Keyboard navigation listener
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (orderedDisplayList.length === 0) return

        const nextIndex = selectedIndex < orderedDisplayList.length - 1 ? (selectedIndex === -1 ? 0 : selectedIndex + 1) : selectedIndex
        setSelectedIndex(nextIndex)
        if (nextIndex >= 0 && nextIndex < orderedDisplayList.length) {
          setSelectedUsername(orderedDisplayList[nextIndex].username)
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (orderedDisplayList.length === 0) return

        const nextIndex = selectedIndex > 0 ? selectedIndex - 1 : selectedIndex
        setSelectedIndex(nextIndex)
        if (nextIndex >= 0 && nextIndex < orderedDisplayList.length) {
          setSelectedUsername(orderedDisplayList[nextIndex].username)
        }
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (selectedUsername) {
          onConfirm(selectedUsername)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, selectedUsername, orderedDisplayList, onClose, onConfirm])

  const handleSend = () => {
    if (selectedUsername) {
      onConfirm(selectedUsername)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm">
          {/* Dismiss overlay */}
          <div className="absolute inset-0 cursor-default" onClick={onClose} />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
            className="relative w-full max-w-2xl overflow-hidden z-10 bg-white dark:bg-[#121622] rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_30px_80px_-15px_rgba(0,0,0,0.5)] border border-slate-100 dark:border-white/10"
          >
            {/* Modal Header */}
            <div className="border-b border-slate-100 dark:border-white/10 px-6 py-5 bg-white dark:bg-[#121622]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                    Send Secure Audio
                  </h3>
                  <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
                    Choose a recipient for this transmission.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                  aria-label="Close modal"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="px-6 pt-5 pb-3 bg-white dark:bg-[#121622]">
              <div className="flex h-12 items-center gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 px-4 focus-within:border-blue-500 dark:focus-within:border-blue-500/50 focus-within:bg-white dark:focus-within:bg-[#1A1F2E] focus-within:ring-4 focus-within:ring-blue-500/10 dark:focus-within:ring-blue-500/10 transition-all">
                <Search size={16} className="text-slate-400 dark:text-slate-500" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search operators..."
                  className="w-full bg-transparent text-[14px] text-slate-900 dark:text-white outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Operators List */}
            <div
              ref={listContainerRef}
              className="max-h-[380px] overflow-y-auto px-6 py-3 space-y-4 bg-white dark:bg-[#121622] scrollbar-thin dark:scrollbar-thumb-white/10"
            >
              {orderedDisplayList.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                  No secure nodes found matching &quot;{search}&quot;
                </div>
              ) : (
                <>
                  {/* Recent Contacts Section */}
                  {recentFiltered.length > 0 && (
                    <div>
                      <div className="px-1.5 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Recent Contacts
                      </div>
                      <div className="space-y-2">
                        {recentFiltered.map((user) => {
                          const globalIndex = orderedDisplayList.indexOf(user)
                          const isSelected = selectedUsername === user.username
                          const isOnline = onlineUsers.has(user.username)
                          const displayName = user.name || user.username
                          const initial = displayName.substring(0, 2).toUpperCase()

                          return (
                            <button
                              key={`recent-${user.id}`}
                              type="button"
                              data-active={isSelected}
                              onClick={() => {
                                setSelectedIndex(globalIndex)
                                setSelectedUsername(user.username)
                              }}
                              onDoubleClick={() => onConfirm(user.username)}
                              className={cn(
                                'group relative flex w-full items-center gap-4 rounded-2xl p-3 text-left transition-all duration-200 border-2 outline-none',
                                isSelected
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-slate-900 dark:text-white shadow-sm'
                                  : 'border-transparent bg-white dark:bg-transparent text-slate-700 dark:text-slate-300 hover:border-slate-200 dark:hover:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                              )}
                            >
                              {/* Avatar */}
                              <div className="relative shrink-0">
                                {user.profilePicture ? (
                                  <img
                                    src={user.profilePicture}
                                    alt={displayName}
                                    className="h-11 w-11 rounded-full border border-slate-200 dark:border-white/10 object-cover"
                                  />
                                ) : (
                                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20 text-sm font-semibold text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-500/30">
                                    {initial}
                                  </div>
                                )}
                                <span
                                  className={cn(
                                    'absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-[#121622]',
                                    isOnline ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'
                                  )}
                                />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[14.5px] font-semibold tracking-tight">
                                    {displayName}
                                  </span>
                                  {isOnline && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                                      online
                                    </span>
                                  )}
                                </div>
                                <span className="truncate text-[12px] text-slate-500 dark:text-slate-400 block mt-0.5">
                                  {user.email || `@${user.username}`}
                                </span>
                              </div>

                              {/* Selection Checkmark circle */}
                              <div className="shrink-0 flex items-center justify-center">
                                <div
                                  className={cn(
                                    'flex h-5 w-5 items-center justify-center rounded-full border transition-all duration-200',
                                    isSelected
                                      ? 'border-blue-500 bg-blue-500 text-white'
                                      : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-transparent text-transparent group-hover:border-slate-300 dark:group-hover:border-white/20'
                                  )}
                                >
                                  <Check size={11} strokeWidth={3} />
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* All Operators Section */}
                  {allOtherFiltered.length > 0 && (
                    <div>
                      <div className="px-1.5 mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        All Operators
                      </div>
                      <div className="space-y-2">
                        {allOtherFiltered.map((user) => {
                          const globalIndex = orderedDisplayList.indexOf(user)
                          const isSelected = selectedUsername === user.username
                          const isOnline = onlineUsers.has(user.username)
                          const displayName = user.name || user.username
                          const initial = displayName.substring(0, 2).toUpperCase()

                          return (
                            <button
                              key={`all-${user.id}`}
                              type="button"
                              data-active={isSelected}
                              onClick={() => {
                                setSelectedIndex(globalIndex)
                                setSelectedUsername(user.username)
                              }}
                              onDoubleClick={() => onConfirm(user.username)}
                              className={cn(
                                'group relative flex w-full items-center gap-4 rounded-2xl p-3 text-left transition-all duration-200 border-2 outline-none',
                                isSelected
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-slate-900 dark:text-white shadow-sm'
                                  : 'border-transparent bg-white dark:bg-transparent text-slate-700 dark:text-slate-300 hover:border-slate-200 dark:hover:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                              )}
                            >
                              {/* Avatar */}
                              <div className="relative shrink-0">
                                {user.profilePicture ? (
                                  <img
                                    src={user.profilePicture}
                                    alt={displayName}
                                    className="h-11 w-11 rounded-full border border-slate-200 dark:border-white/10 object-cover"
                                  />
                                ) : (
                                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20 text-sm font-semibold text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-500/30">
                                    {initial}
                                  </div>
                                )}
                                <span
                                  className={cn(
                                    'absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-[#121622]',
                                    isOnline ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'
                                  )}
                                />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[14.5px] font-semibold tracking-tight">
                                    {displayName}
                                  </span>
                                  {isOnline && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                                      online
                                    </span>
                                  )}
                                </div>
                                <span className="truncate text-[12px] text-slate-500 dark:text-slate-400 block mt-0.5">
                                  {user.email || `@${user.username}`}
                                </span>
                              </div>

                              {/* Selection Checkmark circle */}
                              <div className="shrink-0 flex items-center justify-center">
                                <div
                                  className={cn(
                                    'flex h-5 w-5 items-center justify-center rounded-full border transition-all duration-200',
                                    isSelected
                                      ? 'border-blue-500 bg-blue-500 text-white'
                                      : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-transparent text-transparent group-hover:border-slate-300 dark:group-hover:border-white/20'
                                  )}
                                >
                                  <Check size={11} strokeWidth={3} />
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="h-10 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-transparent px-5 text-[13px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedUsername}
                onClick={handleSend}
                className="h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-[#4A90E2] hover:bg-[#357ABD] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed px-6 text-[13px] font-semibold text-white shadow-sm transition-all"
              >
                Send
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}