import { useState, useEffect, type FormEvent } from 'react'
import { LockKeyhole, Mail, User, UserPlus } from 'lucide-react'
import { PrimaryActionButton } from '../components/ActionButtons'
import { SurfacePanel } from '../components/SurfacePanel'
import { AuraLogo } from '../components/AuraLogo'

type Props = {
  onRegister: (payload: Record<string, string>) => Promise<void> | void
  onGoogleLogin: (credential: string) => Promise<void> | void
  onBackToLogin: () => void
  error: string
  theme?: string
}

export function SignUpScreen({
  onRegister,
  onGoogleLogin,
  onBackToLogin,
  error: serverError,
  theme
}: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState('')

  // Load Google GIS SDK
  useEffect(() => {
    if (!document.getElementById('google-gsi-client')) {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.id = 'google-gsi-client'
      script.async = true
      script.defer = true
      document.body.appendChild(script)
    }
  }, [])

  // Render Google Button when SDK is ready
  useEffect(() => {
    let active = true
    const initGoogleBtn = () => {
      if (!active) return
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || 'your-google-client-id.apps.googleusercontent.com',
          callback: (res: any) => {
            if (res.credential && active) {
              onGoogleLogin(res.credential)
            }
          }
        })
        const container = document.getElementById('google-signup-btn-container')
        if (container) {
          window.google.accounts.id.renderButton(container, {
            theme: theme === 'light' ? 'outline' : 'filled_black',
            size: 'large',
            text: 'signup_with',
            width: container.clientWidth || 360,
            shape: 'pill'
          })
        }
      } else {
        setTimeout(initGoogleBtn, 150)
      }
    }
    initGoogleBtn()
    return () => {
      active = false
    }
  }, [onGoogleLogin, theme])

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

    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setLocalError('All fields are required.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setLocalError('Invalid email format.')
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
      await onRegister({ name, email, password, confirmPassword })
    } catch {
      // Server error is passed via props
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-y-auto bg-aura-bg px-6 py-10 text-aura-text flex flex-col items-center justify-center">
      <div className="pointer-events-none absolute inset-0 bg-noise opacity-55" />
      <div className="pointer-events-none absolute left-1/2 top-20 h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(93,87,255,0.12),transparent_65%)] blur-3xl" />

      <div className="relative w-full max-w-[420px] flex flex-col items-center">
        {/* Large Enlarged SVG Logo & Tagline */}
        <div className="mb-8 flex flex-col items-center text-center">
          <AuraLogo className="h-16 md:h-20 w-auto text-aura-text filter drop-shadow-[0_0_15px_rgba(93,87,255,0.15)]" />
          <h2 className="text-xs font-mono uppercase tracking-[0.4em] text-aura-dim mt-4">
            Encoded in Sound
          </h2>
        </div>

        {/* Centered Glassmorphic Panel */}
        <SurfacePanel className="w-full p-6 sm:p-8 backdrop-blur-xl border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
                Registration
              </div>
              <div className="mt-1 text-[22px] font-medium text-aura-text">
                Register Operator
              </div>
            </div>

            <label className="block">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
                Full Name
              </div>
              <div className="flex items-center gap-3 rounded-[22px] border border-aura-border/18 bg-aura-surface/40 px-4 py-2.5">
                <User size={16} className="text-aura-dim" />
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full border-none bg-transparent text-sm text-aura-text outline-none placeholder:text-aura-dim"
                  placeholder="Alice Operator"
                  required
                />
              </div>
            </label>

            <label className="block">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
                Email Address
              </div>
              <div className="flex items-center gap-3 rounded-[22px] border border-aura-border/18 bg-aura-surface/40 px-4 py-2.5">
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

            <label className="block">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
                Password
              </div>
              <div className="flex items-center gap-3 rounded-[22px] border border-aura-border/18 bg-aura-surface/40 px-4 py-2.5">
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
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
                Confirm Password
              </div>
              <div className="flex items-center gap-3 rounded-[22px] border border-aura-border/18 bg-aura-surface/40 px-4 py-2.5">
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

            {/* Password checklist integrated within the card */}
            <div className="rounded-xl bg-white/[0.01] border border-white/4 p-3 text-[11px] space-y-1 text-aura-muted">
              <div className="font-semibold text-[9px] uppercase tracking-wider text-aura-dim mb-1">
                Password Strength Checklist:
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                <div className={hasMinLen ? 'text-aura-reveal' : 'text-aura-dim'}>
                  {hasMinLen ? '✓' : '•'} Min 8 characters
                </div>
                <div className={hasUpper && hasLower ? 'text-aura-reveal' : 'text-aura-dim'}>
                  {hasUpper && hasLower ? '✓' : '•'} Mixed case (A-Z)
                </div>
                <div className={hasDigit ? 'text-aura-reveal' : 'text-aura-dim'}>
                  {hasDigit ? '✓' : '•'} At least one number
                </div>
                <div className={hasSpecial ? 'text-aura-reveal' : 'text-aura-dim'}>
                  {hasSpecial ? '✓' : '•'} Special symbol
                </div>
              </div>
            </div>

            {displayError ? (
              <div className="rounded-[18px] border border-aura-danger/25 bg-aura-danger/10 px-4 py-2.5 text-sm text-aura-danger">
                {displayError}
              </div>
            ) : null}

            <PrimaryActionButton
              type="submit"
              disabled={submitting || !name.trim() || !email.trim() || !password || !confirmPassword}
              className="w-full"
            >
              <UserPlus size={16} className="mr-2" />
              {submitting ? 'Registering...' : 'Register Profile'}
            </PrimaryActionButton>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-white/8"></div>
              <span className="flex-shrink mx-4 text-[9px] uppercase tracking-wider text-aura-dim">or</span>
              <div className="flex-grow border-t border-white/8"></div>
            </div>

            <div className="flex justify-center">
              <div id="google-signup-btn-container" className="w-full flex justify-center min-h-[40px]"></div>
            </div>

            <div className="text-center text-xs text-aura-muted">
              Already registered?{' '}
              <button
                type="button"
                onClick={onBackToLogin}
                className="text-aura-accent hover:underline font-medium"
              >
                Back to Login
              </button>
            </div>
          </form>
        </SurfacePanel>
      </div>
    </div>
  )
}
