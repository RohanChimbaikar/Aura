import { useState, type FormEvent } from 'react'
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { PrimaryActionButton } from '../components/ActionButtons'
import { SurfacePanel } from '../components/SurfacePanel'

type Props = {
  onSubmit: (email: string) => Promise<void> | void
  onBackToLogin: () => void
  error: string
}

export function ForgotPasswordScreen({ onSubmit, onBackToLogin, error: serverError }: Props) {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [localError, setLocalError] = useState('')

  const displayError = localError || serverError

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError('')
    setSuccess(false)

    if (!email.trim()) {
      setLocalError('Email address is required.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setLocalError('Invalid email format.')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(email)
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
              Security Gateway
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-aura-text lg:text-5xl">
              Recover access to your steganography workspace.
            </h1>
            <p className="mt-5 max-w-[480px] text-[15px] leading-7 text-aura-muted">
              Submit your verified email address. We will generate and send a secure, time-bound password reset token link.
            </p>
          </div>

          <SurfacePanel className="p-6 lg:p-7 self-center">
            {success ? (
              <div className="space-y-5 py-6 text-center">
                <div className="flex justify-center">
                  <CheckCircle2 size={48} className="text-aura-accent" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-aura-text">Reset Link Dispatched</h3>
                  <p className="text-sm text-aura-muted max-w-[340px] mx-auto leading-6">
                    If this email matches a registered workspace operator, a secure reset link has been generated and logged.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onBackToLogin}
                  className="flex items-center justify-center gap-2 mx-auto text-xs text-aura-accent hover:underline"
                >
                  <ArrowLeft size={14} /> Back to Login
                </button>
              </div>
            ) : (
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
                    Recovery
                  </div>
                  <div className="mt-1 text-[22px] font-medium text-aura-text">
                    Forgot Password
                  </div>
                </div>

                <label className="block">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
                    Email Address
                  </div>
                  <div className="flex items-center gap-3 rounded-[22px] border border-aura-border/18 bg-aura-surface/40 px-4 py-3">
                    <Mail size={16} className="text-aura-dim" />
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full border-none bg-transparent text-sm text-aura-text outline-none placeholder:text-aura-dim"
                      placeholder="operator@aura.ai"
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
                  disabled={submitting || !email.trim()}
                  className="w-full"
                >
                  {submitting ? 'Verifying...' : 'Request Reset Link'}
                </PrimaryActionButton>

                <div className="text-center text-xs text-aura-muted">
                  <button
                    type="button"
                    onClick={onBackToLogin}
                    className="flex items-center justify-center gap-2 mx-auto hover:text-aura-accent transition-colors"
                  >
                    <ArrowLeft size={14} /> Back to Login
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
