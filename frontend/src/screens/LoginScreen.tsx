import { useState, type FormEvent } from 'react'
import { LockKeyhole, LogIn, UserRound } from 'lucide-react'
import { PrimaryActionButton } from '../components/ActionButtons'
import { SurfacePanel } from '../components/SurfacePanel'

type Props = {
  onLogin: (username: string, password: string) => Promise<void> | void
  error: string
}

export function LoginScreen({ onLogin, error }: Props) {
  const [username, setUsername] = useState('sender_user')
  const [password, setPassword] = useState('password123')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await onLogin(username, password)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-aura-bg px-6 py-10 text-aura-text">
      <div className="pointer-events-none absolute inset-0 bg-noise opacity-55" />
      <div className="pointer-events-none absolute left-1/2 top-20 h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(93,87,255,0.16),transparent_65%)] blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="max-w-[560px] py-8">
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-aura-dim">
              Aura Session Gateway
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-aura-text lg:text-5xl">
              Universal neural audio steganography, now with live operator chat.
            </h1>
            <p className="mt-5 max-w-[520px] text-[15px] leading-7 text-aura-muted">
              Sign in to open the communication layer around your fixed Aura model.
              Text updates are realtime, while stego WAV transfer stays on secure HTTP
              upload and download endpoints.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
                <div className="text-sm font-medium text-aura-text">Demo sender</div>
                <div className="mt-2 font-mono text-sm text-aura-muted">
                  sender_user / password123
                </div>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
                <div className="text-sm font-medium text-aura-text">Demo receiver</div>
                <div className="mt-2 font-mono text-sm text-aura-muted">
                  receiver_user / password123
                </div>
              </div>
            </div>
          </div>

          <SurfacePanel className="self-center p-6 lg:p-7">
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
                  Login
                </div>
                <div className="mt-2 text-[22px] font-medium text-aura-text">
                  Enter secure workspace
                </div>
              </div>

              <label className="block">
                <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
                  Username
                </div>
                <div className="flex items-center gap-3 rounded-[22px] border border-aura-border/18 bg-aura-surface/40 px-4 py-3">
                  <UserRound size={16} className="text-aura-dim" />
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="w-full border-none bg-transparent text-sm text-aura-text outline-none placeholder:text-aura-dim"
                    placeholder="sender_user"
                  />
                </div>
              </label>

              <label className="block">
                <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
                  Password
                </div>
                <div className="flex items-center gap-3 rounded-[22px] border border-aura-border/18 bg-aura-surface/40 px-4 py-3">
                  <LockKeyhole size={16} className="text-aura-dim" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full border-none bg-transparent text-sm text-aura-text outline-none placeholder:text-aura-dim"
                    placeholder="password123"
                  />
                </div>
              </label>

              {error ? (
                <div className="rounded-[18px] border border-aura-danger/25 bg-aura-danger/10 px-4 py-3 text-sm text-aura-danger">
                  {error}
                </div>
              ) : null}

              <PrimaryActionButton
                type="submit"
                disabled={submitting || !username.trim() || !password.trim()}
                className="w-full"
              >
                <LogIn size={16} className="mr-2" />
                {submitting ? 'Signing in...' : 'Sign in'}
              </PrimaryActionButton>
            </form>
          </SurfacePanel>
        </div>
      </div>
    </div>
  )
}
