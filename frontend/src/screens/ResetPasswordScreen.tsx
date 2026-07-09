import { useState, type FormEvent } from 'react'
import { LockKeyhole, CheckCircle2 } from 'lucide-react'
import { PrimaryActionButton } from '../components/ActionButtons'
import { SurfacePanel } from '../components/SurfacePanel'

type Props = {
  onSubmit: (password: string) => Promise<void> | void
  onBackToLogin: () => void
  error: string
}

export function ResetPasswordScreen({ onSubmit, onBackToLogin, error: serverError }: Props) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [localError, setLocalError] = useState('')

  // Password validation checks
  const hasMinLen = password.length >= 8
  const hasUpper = /[A-Z]/.test(password)
  const hasLower = /[a-z]/.test(password)
  const hasDigit = /\d/.test(password)
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password)
  const isStrong = hasMinLen && hasUpper && hasLower && hasDigit && hasSpecial

  const displayError = localError || serverError

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError('')
    setSuccess(false)

    if (!password || !confirmPassword) {
      setLocalError('All fields are required.')
      return
    }

    if (!isStrong) {
      setLocalError('Please choose a stronger password.')
      return
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(password)
      setSuccess(true)
    } catch {
      // Server error is handled via props
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-aura-bg px-6 py-10 text-aura-text">
      <div className="pointer-events-none absolute inset-0 bg-noise opacity-55" />
      <div className="pointer-events-none absolute left-1/2 top-20 h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(93,87,255,0.16),transparent_65%)] blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1fr_1.1fr] max-w-5xl">
          <div className="py-8 self-center">
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-aura-dim">
              Security Override
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-aura-text lg:text-5xl">
              Configure your new operator password.
            </h1>
            <p className="mt-5 max-w-[480px] text-[15px] leading-7 text-aura-muted">
              Choose a strong, unique password to secure your communications and steganographic data.
            </p>

            <div className="mt-6 space-y-2 border-l-2 border-aura-border/10 pl-4 text-xs">
              <div className="font-semibold text-aura-dim mb-1 uppercase tracking-wider text-[10px]">
                Requirements:
              </div>
              <div className={hasMinLen ? 'text-aura-text/80' : 'text-aura-dim'}>
                ✓ Minimum 8 characters
              </div>
              <div className={hasUpper && hasLower ? 'text-aura-text/80' : 'text-aura-dim'}>
                ✓ Mixed case (A-Z & a-z)
              </div>
              <div className={hasDigit ? 'text-aura-text/80' : 'text-aura-dim'}>
                ✓ At least one number
              </div>
              <div className={hasSpecial ? 'text-aura-text/80' : 'text-aura-dim'}>
                ✓ Special symbol (!@#$ etc.)
              </div>
            </div>
          </div>

          <SurfacePanel className="p-6 lg:p-7 self-center">
            {success ? (
              <div className="space-y-5 py-6 text-center">
                <div className="flex justify-center">
                  <CheckCircle2 size={48} className="text-aura-accent" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-aura-text">Password Updated</h3>
                  <p className="text-sm text-aura-muted max-w-[340px] mx-auto leading-6">
                    Your password has been successfully reset. You can now use your new credentials to log into the workspace.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onBackToLogin}
                  className="flex items-center justify-center gap-2 mx-auto text-xs text-aura-accent hover:underline"
                >
                  Proceed to Login
                </button>
              </div>
            ) : (
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
                    Reset Token Active
                  </div>
                  <div className="mt-1 text-[22px] font-medium text-aura-text">
                    Choose New Password
                  </div>
                </div>

                <label className="block">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
                    New Password
                  </div>
                  <div className="flex items-center gap-3 rounded-[22px] border border-aura-border/18 bg-aura-surface/40 px-4 py-3">
                    <LockKeyhole size={16} className="text-aura-dim" />
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full border-none bg-transparent text-sm text-aura-text outline-none placeholder:text-aura-dim"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </label>

                <label className="block">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
                    Confirm New Password
                  </div>
                  <div className="flex items-center gap-3 rounded-[22px] border border-aura-border/18 bg-aura-surface/40 px-4 py-3">
                    <LockKeyhole size={16} className="text-aura-dim" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="w-full border-none bg-transparent text-sm text-aura-text outline-none placeholder:text-aura-dim"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </label>

                {displayError ? (
                  <div className="rounded-[18px] border border-aura-danger/25 bg-aura-danger/10 px-4 py-3 text-sm text-aura-danger">
                    {displayError}
                  </div>
                ) : null}

                <PrimaryActionButton
                  type="submit"
                  disabled={submitting || !password || !confirmPassword}
                  className="w-full"
                >
                  {submitting ? 'Updating...' : 'Update Password'}
                </PrimaryActionButton>

                <div className="text-center text-xs text-aura-muted">
                  <button
                    type="button"
                    onClick={onBackToLogin}
                    className="flex items-center justify-center gap-2 mx-auto hover:text-aura-accent transition-colors"
                  >
                    Back to Login
                  </button>
                </div>
              </form>
            )}
          </SurfacePanel>
        </div>
      </div>
    </div>
  )
}
