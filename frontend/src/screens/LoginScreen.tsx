import { useState, useEffect, type FormEvent } from 'react'
import { Lock, EyeOff, ShieldCheck, Activity, Code, User, ArrowRight } from 'lucide-react'
import ColorBends from '../components/ColorBends/ColorBends'
import { AuraLogo } from '../components/AuraLogo'

declare global {
  interface Window {
    google: any
  }
}

type Props = {
  onLogin: (usernameOrEmail: string, password: string, rememberMe: boolean) => Promise<void> | void
  onGoogleLogin: (credential: string) => Promise<void> | void
  onSignUpClick: () => void
  onForgotPasswordClick: () => void
  error: string
  theme?: string
}

export function LoginScreen({
  onLogin,
  onGoogleLogin,
  onSignUpClick,
  onForgotPasswordClick,
  error,
}: Props) {
  const [username, setUsername] = useState('sender_user')
  const [password, setPassword] = useState('password123')
  const [rememberMe, setRememberMe] = useState(false)
  const [submitting, setSubmitting] = useState(false)

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
        const container = document.getElementById('google-btn-container')
        if (container) {
          window.google.accounts.id.renderButton(container, {
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            width: container.clientWidth || 360,
            shape: 'rectangular'
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
  }, [onGoogleLogin])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await onLogin(username, password, rememberMe)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full bg-[#F8FAFC] font-sans text-slate-900">
      
      {/* Left Panel: Branding & Features (Hidden on mobile) */}
      <div className="hidden lg:flex w-1/2 relative bg-[#F2F6FE] flex-col p-12 xl:p-20 overflow-hidden border-r border-blue-50/50">
        
        {/* INTERACTIVE BACKGROUND */}
        {/* Placed at the bottom to mimic the original wave, but fills the space and responds to pointer */}
        <div className="absolute inset-0 z-0 opacity-60">
          <ColorBends
            colors={["#A3C6F2", "#4A90E2", "#80B3F7"]} // Aura theme blues
            rotation={45}
            speed={0.15}
            scale={1.2}
            frequency={1.5}
            warpStrength={1.5}
            mouseInfluence={1.2}
            noise={0.05}
            parallax={0.3}
            iterations={2}
            intensity={1.2}
            bandWidth={5}
            transparent={true}
          />
        </div>

        {/* Top/Center Content */}
        {/* Added pointer-events-none to let the mouse interact with the WebGL canvas underneath */}
        <div className="relative z-10 flex flex-col items-center flex-1 w-full max-w-md mx-auto pt-8 pointer-events-none">
          
          {/* SVG Logo */}
          <div className="flex flex-col items-center mb-10 w-full">
            <AuraLogo className="text-slate-900 scale-125 my-4" />
            <div className="h-[2px] w-8 bg-[#4A90E2] rounded-full mt-6" />
          </div>

          {/* Main Copy */}
          <div className="text-center mb-12 w-full">
            <h1 className="text-3xl font-semibold text-slate-900 mb-4 tracking-tight">
              Secure. Hidden. Intelligent.
            </h1>
            <p className="text-slate-600 leading-relaxed text-[15px]">
              Aura embeds hidden text inside speech audio using advanced neural networks for secure, reliable and undetectable communication.
            </p>
          </div>

          {/* Feature List */}
          <div className="space-y-7 w-full pl-4">
            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-white/60 text-blue-600 rounded-[14px] backdrop-blur-sm border border-white/40 shadow-sm">
                <ShieldCheck size={22} strokeWidth={1.5} />
              </div>
              <div className="text-left pt-0.5">
                <h3 className="text-[15px] font-medium text-slate-900 mb-0.5">Secure by Design</h3>
                <p className="text-sm text-slate-600">End-to-end protection for your data.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-white/60 text-blue-600 rounded-[14px] backdrop-blur-sm border border-white/40 shadow-sm">
                <Activity size={22} strokeWidth={1.5} />
              </div>
              <div className="text-left pt-0.5">
                <h3 className="text-[15px] font-medium text-slate-900 mb-0.5">Neural Precision</h3>
                <p className="text-sm text-slate-600">State-of-the-art models for exact recovery.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-white/60 text-blue-600 rounded-[14px] backdrop-blur-sm border border-white/40 shadow-sm">
                <Lock size={22} strokeWidth={1.5} />
              </div>
              <div className="text-left pt-0.5">
                <h3 className="text-[15px] font-medium text-slate-900 mb-0.5">Private & Local-First</h3>
                <p className="text-sm text-slate-600">Your data stays yours. Always.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Left Panel Footer */}
        <div className="relative z-10 w-full max-w-md mx-auto text-xs text-slate-500 font-medium pt-12 pointer-events-none">
          © 2025 Aura Project • All rights reserved.
        </div>
      </div>

      {/* Right Panel: Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col relative bg-white lg:bg-transparent">
        <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
          
          <div className="w-full max-w-[440px] bg-white lg:rounded-3xl lg:shadow-[0_8px_40px_rgb(0,0,0,0.06)] lg:border border-slate-100 p-2 sm:p-10 z-10">
            <div className="mb-8">
              <h2 className="text-3xl font-semibold text-slate-900 tracking-tight">Welcome back</h2>
              <p className="text-[15px] text-slate-500 mt-2">Sign in to your Aura operator account</p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              
              {/* Username/Email Input */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Email or Username
                </label>
                <div className="relative flex items-center group">
                  <div className="absolute left-4 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                    <User size={18} strokeWidth={1.5} />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-[12px] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] text-slate-900 placeholder:text-slate-400 transition-all outline-none"
                    placeholder="Enter your email or username"
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Password
                </label>
                <div className="relative flex items-center group">
                  <div className="absolute left-4 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                    <Lock size={18} strokeWidth={1.5} />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-12 py-3 bg-white border border-slate-200 rounded-[12px] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] text-slate-900 placeholder:text-slate-400 transition-all outline-none"
                    placeholder="Enter your password"
                    required
                  />
                  <button type="button" className="absolute right-4 text-slate-400 hover:text-slate-600 transition-colors">
                    <EyeOff size={18} strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between pt-2 pb-2">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500/30"
                  />
                  <span className="text-sm text-slate-600 font-medium">Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={onForgotPasswordClick}
                  className="text-sm text-blue-500 hover:text-blue-600 font-medium transition-colors"
                >
                  Forgot password?
                </button>
              </div>

              {/* Error Message */}
              {error && (
                <div className="rounded-[12px] border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting || !username.trim() || !password.trim()}
                className="w-full py-3 mt-2 bg-gradient-to-r from-[#5598F5] to-[#4585F0] hover:from-[#4485DF] hover:to-[#3872D1] text-white rounded-[12px] font-medium transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                Sign in <ArrowRight size={18} />
              </button>

              {/* Divider */}
              <div className="relative flex items-center py-4">
                <div className="flex-grow border-t border-slate-100"></div>
                <span className="flex-shrink-0 mx-4 text-[13px] text-slate-400">or</span>
                <div className="flex-grow border-t border-slate-100"></div>
              </div>

              {/* Google Button */}
              <div className="flex justify-center w-full pb-2">
                <div id="google-btn-container" className="w-full flex justify-center min-h-[44px]"></div>
              </div>

              {/* Sign Up Link */}
              <div className="text-center text-sm text-slate-500">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={onSignUpClick}
                  className="text-blue-500 hover:text-blue-600 font-medium"
                >
                  Sign up
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Panel Footer (Badges) */}
        <div className="pb-8 pt-4 flex justify-center items-center gap-6 sm:gap-8 text-[13px] text-slate-500 font-medium bg-white lg:bg-transparent z-10">
          <div className="flex items-center gap-2"><ShieldCheck size={16} strokeWidth={1.5} /> Secure by design</div>
          <div className="hidden sm:block w-px h-4 bg-slate-200"></div>
          <div className="flex items-center gap-2"><Lock size={16} strokeWidth={1.5} /> Local-first</div>
          <div className="hidden sm:block w-px h-4 bg-slate-200"></div>
          <div className="flex items-center gap-2"><Code size={16} strokeWidth={1.5} /> Open source</div>
        </div>
      </div>

    </div>
  )
}