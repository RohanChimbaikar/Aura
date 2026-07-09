import { useState, type FormEvent } from 'react'
import { X, LockKeyhole, KeyRound } from 'lucide-react'
import { SurfacePanel } from './SurfacePanel'
import { PrimaryActionButton } from './ActionButtons'
import { changePassword } from '../services/api'

type Props = {
  onClose: () => void
}

export function ChangePasswordModal({ onClose }: Props) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Password validation checks
  const hasMinLen = newPassword.length >= 8
  const hasUpper = /[A-Z]/.test(newPassword)
  const hasLower = /[a-z]/.test(newPassword)
  const hasDigit = /\d/.test(newPassword)
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword)
  const isStrong = hasMinLen && hasUpper && hasLower && hasDigit && hasSpecial

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccessMsg('')

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required.')
      return
    }

    if (!isStrong) {
      setError('New password does not meet the complexity checklist.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const res = await changePassword(currentPassword, newPassword)
      setSuccessMsg(res.message || 'Password changed successfully.')
      // Clear inputs
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
      <SurfacePanel className="relative w-full max-w-md overflow-hidden p-6 shadow-2xl border border-white/12">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-aura-muted hover:text-aura-text transition-colors"
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="border-b border-white/8 pb-4">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-aura-accent">
              Security Access Control
            </h2>
            <h3 className="mt-1 text-2xl font-semibold text-aura-text">
              Change Password
            </h3>
          </div>

          <label className="block">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
              Current Password
            </div>
            <div className="flex items-center gap-3 rounded-[22px] border border-white/8 bg-aura-surface/40 px-4 py-2.5">
              <LockKeyhole size={16} className="text-aura-dim" />
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full border-none bg-transparent text-sm text-aura-text outline-none placeholder:text-aura-dim"
                placeholder="Current Password"
                required
              />
            </div>
          </label>

          <label className="block">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
              New Password
            </div>
            <div className="flex items-center gap-3 rounded-[22px] border border-white/8 bg-aura-surface/40 px-4 py-2.5">
              <LockKeyhole size={16} className="text-aura-dim" />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border-none bg-transparent text-sm text-aura-text outline-none placeholder:text-aura-dim"
                placeholder="New Password"
                required
              />
            </div>
          </label>

          <label className="block">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
              Confirm New Password
            </div>
            <div className="flex items-center gap-3 rounded-[22px] border border-white/8 bg-aura-surface/40 px-4 py-2.5">
              <LockKeyhole size={16} className="text-aura-dim" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border-none bg-transparent text-sm text-aura-text outline-none placeholder:text-aura-dim"
                placeholder="Confirm New Password"
                required
              />
            </div>
          </label>

          {/* Password strength visual helper */}
          <div className="rounded-xl bg-white/[0.01] border border-white/4 p-3 text-[11px] space-y-1 text-aura-muted">
            <div className="font-semibold text-[9px] uppercase tracking-wider text-aura-dim mb-1">
              New Password Strength Checklist:
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              <div className={hasMinLen ? 'text-aura-reveal' : 'text-aura-dim'}>
                {hasMinLen ? '✓' : '•'} Min 8 characters
              </div>
              <div className={hasUpper ? 'text-aura-reveal' : 'text-aura-dim'}>
                {hasUpper ? '✓' : '•'} One uppercase (A-Z)
              </div>
              <div className={hasLower ? 'text-aura-reveal' : 'text-aura-dim'}>
                {hasLower ? '✓' : '•'} One lowercase (a-z)
              </div>
              <div className={hasDigit ? 'text-aura-reveal' : 'text-aura-dim'}>
                {hasDigit ? '✓' : '•'} One number (0-9)
              </div>
              <div className={hasSpecial ? 'text-aura-reveal' : 'text-aura-dim'}>
                {hasSpecial ? '✓' : '•'} One special key
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-aura-danger/25 bg-aura-danger/10 px-4 py-2.5 text-xs text-aura-danger">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="rounded-2xl border border-aura-reveal/25 bg-aura-reveal/10 px-4 py-2.5 text-xs text-aura-reveal">
              {successMsg}
            </div>
          )}

          <PrimaryActionButton
            type="submit"
            disabled={submitting || !currentPassword || !newPassword || !confirmPassword || !isStrong}
            className="w-full"
          >
            <KeyRound size={16} className="mr-2" />
            {submitting ? 'Updating Node...' : 'Update Password'}
          </PrimaryActionButton>
        </form>
      </SurfacePanel>
    </div>
  )
}
