import { X, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { User } from '../types'

type Props = {
  user: User
  onClose: () => void
}

export function UserProfileModal({ user, onClose }: Props) {
  const isGoogle = Boolean(user.googleId)
  const signupDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        dateStyle: 'long',
      })
    : 'Unknown'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 dark:bg-black/60 p-4 backdrop-blur-sm transition-colors duration-300">
      {/* Dismiss Overlay */}
      <div className="absolute inset-0 cursor-default" onClick={onClose} />

      <div className="relative w-full max-w-md overflow-hidden p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_30px_80px_-15px_rgba(0,0,0,0.5)] rounded-[24px] bg-white dark:bg-[#121622] border border-slate-200 dark:border-white/10 z-10 transition-colors duration-300">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        <div className="space-y-6">
          {/* Header */}
          <div className="border-b border-slate-100 dark:border-white/10 pb-5 transition-colors duration-300">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-600 dark:text-blue-400">
              Aura Operator Registry
            </h2>
            <h3 className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-white transition-colors duration-300">
              Operator Profile
            </h3>
          </div>

          {/* Profile Section */}
          <div className="flex flex-col items-center gap-4 py-2">
            {user.profilePicture ? (
              <img
                src={user.profilePicture}
                alt={user.name || user.username}
                className="h-24 w-24 rounded-full border-4 border-slate-50 dark:border-white/5 shadow-md object-cover transition-colors duration-300"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-500/20 text-3xl font-semibold text-blue-600 dark:text-blue-400 border-4 border-white dark:border-blue-500/30 shadow-sm transition-colors duration-300">
                {(user.name || user.username).substring(0, 2).toUpperCase()}
              </div>
            )}

            <div className="text-center">
              <h4 className="text-xl font-semibold text-slate-900 dark:text-white transition-colors duration-300">
                {user.name || 'Aura Operator'}
              </h4>
              <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-0.5 transition-colors duration-300">
                @{user.username}
              </p>
            </div>
          </div>

          {/* Details Card */}
          <div className="flex flex-col rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 p-1 text-[14px] transition-colors duration-300">
            
            <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 dark:border-white/5 transition-colors duration-300">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Primary Email</span>
              <span className="font-mono text-slate-900 dark:text-white text-[13px] transition-colors duration-300">
                {user.email || 'Not configured'}
              </span>
            </div>

            <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 dark:border-white/5 transition-colors duration-300">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Registry Date</span>
              <span className="text-slate-900 dark:text-white font-medium transition-colors duration-300">{signupDate}</span>
            </div>

            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Authorization Node</span>
              <div className="flex items-center gap-1.5 text-[13px]">
                {isGoogle ? (
                  <>
                    <ShieldCheck size={16} className="text-emerald-500 dark:text-emerald-400" />
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold transition-colors duration-300">
                      Google Auth Linked
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldAlert size={16} className="text-slate-400 dark:text-slate-500" />
                    <span className="text-slate-600 dark:text-slate-400 font-semibold transition-colors duration-300">
                      Standard Node
                    </span>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}