import { useState, useEffect, type FormEvent } from 'react'
import { Lock, Eye, EyeOff, Mail, User, ShieldCheck, Activity, Code, ArrowRight } from 'lucide-react'
import ColorBends from '../components/ColorBends/ColorBends'
import { AuraLogo } from '../components/AuraLogo'

declare global {
  interface Window {
    google: any
  }
}

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
}: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

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
            theme: 'outline',
            size: 'large',
            text: 'signup_with',
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
    <div className="flex min-h-screen w-full bg-[#F8FAFC] font-sans text-slate-900">
      
      {/* Left Panel: Branding & Features (Hidden on mobile) */}
      <div className="hidden lg:flex w-1/2 relative bg-[#F2F6FE] flex-col p-12 xl:p-20 overflow-hidden border-r border-blue-50/50">
        
        {/* INTERACTIVE BACKGROUND */}
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
        <div className="relative z-10 flex flex-col items-center flex-1 w-full max-w-md mx-auto pt-8 pointer-events-none">
          
          {/* SVG Logo */}
          <div className="flex flex-col items-center mb-10 w-full">
            <AuraLogo className="text-slate-900 scale-125 my-4" />
            <div className="h-[2px] w-8 bg-[#4A90E2] rounded-full mt-6" />
          </div>

          {/* Main Copy */}
          <div className="text-center mb-12 w-full">
            <h1 className="text-3xl font-semibold text-slate-900 mb-4 tracking-tight">
              Join the Aura Network.
            </h1>
            <p className="text-slate-600 leading-relaxed text-[15px]">
              Create your operator profile to start sending and receiving secure, hidden communications embedded directly inside speech audio.
            </p>
          </div>

          {/* Feature List */}
          <div className="space-y-7 w-full pl-4">
            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-white/60 text-blue-600 rounded-[14px] backdrop-blur-sm border border-white/40 shadow-sm">
                <User size={22} strokeWidth={1.5} />
              </div>
              <div className="text-left pt-0.5">
                <h3 className="text-[15px] font-medium text-slate-900 mb-0.5">Operator Identity</h3>
                <p className="text-sm text-slate-600">Establish your unique, secure operator credentials.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-white/60 text-blue-600 rounded-[14px] backdrop-blur-sm border border-white/40 shadow-sm">
                <Activity size={22} strokeWidth={1.5} />
              </div>
              <div className="text-left pt-0.5">
                <h3 className="text-[15px] font-medium text-slate-900 mb-0.5">Steganographic Audio</h3>
                <p className="text-sm text-slate-600">Hide payload text inside cover audio waves imperceptibly.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-white/60 text-blue-600 rounded-[14px] backdrop-blur-sm border border-white/40 shadow-sm">
                <ShieldCheck size={22} strokeWidth={1.5} />
              </div>
              <div className="text-left pt-0.5">
                <h3 className="text-[15px] font-medium text-slate-900 mb-0.5">Cryptographic Verification</h3>
                <p className="text-sm text-slate-600">Only recipients with authentic keys can extract hidden messages.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Left Panel Footer */}
        <div className="relative z-10 w-full max-w-md mx-auto text-xs text-slate-500 font-medium pt-12 pointer-events-none">
          © 2025 Aura Project • All rights reserved.
        </div>
      </div>

      {/* Right Panel: Signup Form */}
      <div className="w-full lg:w-1/2 flex flex-col relative bg-white lg:bg-transparent overflow-y-auto">
        <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
          
          <div className="w-full max-w-[440px] bg-white lg:rounded-3xl lg:shadow-[0_8px_40px_rgb(0,0,0,0.06)] lg:border border-slate-100 p-2 sm:p-10 z-10">
            <div className="mb-8">
              <h2 className="text-3xl font-semibold text-slate-900 tracking-tight">Create operator account</h2>
              <p className="text-[15px] text-slate-500 mt-2">Sign up to join the secure Aura network</p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              
              {/* Full Name Input */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Full Name
                </label>
                <div className="relative flex items-center group">
                  <div className="absolute left-4 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                    <User size={18} strokeWidth={1.5} />
                  </div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-[12px] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] text-slate-900 placeholder:text-slate-400 transition-all outline-none"
                    placeholder="Alice Operator"
                    required
                  />
                </div>
              </div>

              {/* Email Address Input */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Email Address
                </label>
                <div className="relative flex items-center group">
                  <div className="absolute left-4 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                    <Mail size={18} strokeWidth={1.5} />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-[12px] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] text-slate-900 placeholder:text-slate-400 transition-all outline-none"
                    placeholder="operator@aura.ai"
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
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-12 py-3 bg-white border border-slate-200 rounded-[12px] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] text-slate-900 placeholder:text-slate-400 transition-all outline-none"
                    placeholder="Enter password"
                    required
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <Eye size={18} strokeWidth={1.5} /> : <EyeOff size={18} strokeWidth={1.5} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Input */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Confirm Password
                </label>
                <div className="relative flex items-center group">
                  <div className="absolute left-4 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                    <Lock size={18} strokeWidth={1.5} />
                  </div>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-12 pr-12 py-3 bg-white border border-slate-200 rounded-[12px] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] text-slate-900 placeholder:text-slate-400 transition-all outline-none"
                    placeholder="Confirm password"
                    required
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showConfirmPassword ? <Eye size={18} strokeWidth={1.5} /> : <EyeOff size={18} strokeWidth={1.5} />}
                  </button>
                </div>
              </div>

              {/* Password strength checklist integrated within the card */}
              <div className="rounded-[12px] border border-slate-100 bg-slate-50/50 p-3 text-[11px] space-y-1.5 text-slate-500">
                <div className="font-semibold text-[9.5px] uppercase tracking-wider text-slate-400 mb-1">
                  Password Strength Checklist
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  <div className={hasMinLen ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                    {hasMinLen ? '✓' : '•'} Min 8 characters
                  </div>
                  <div className={hasUpper && hasLower ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                    {hasUpper && hasLower ? '✓' : '•'} Mixed case (A-Z)
                  </div>
                  <div className={hasDigit ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                    {hasDigit ? '✓' : '•'} At least one number
                  </div>
                  <div className={hasSpecial ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                    {hasSpecial ? '✓' : '•'} Special symbol
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {displayError && (
                <div className="rounded-[12px] border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  {displayError}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting || !name.trim() || !email.trim() || !password || !confirmPassword}
                className="w-full py-3 mt-2 bg-gradient-to-r from-[#5598F5] to-[#4585F0] hover:from-[#4485DF] hover:to-[#3872D1] text-white rounded-[12px] font-medium transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? 'Registering...' : 'Register Profile'} <ArrowRight size={18} />
              </button>

              {/* Divider */}
              <div className="relative flex items-center py-4">
                <div className="flex-grow border-t border-slate-100"></div>
                <span className="flex-shrink-0 mx-4 text-[13px] text-slate-400">or</span>
                <div className="flex-grow border-t border-slate-100"></div>
              </div>

              {/* Google Button */}
              <div className="flex justify-center w-full pb-2">
                <div id="google-signup-btn-container" className="w-full flex justify-center min-h-[44px]"></div>
              </div>

              {/* Back to Login Link */}
              <div className="text-center text-sm text-slate-500">
                Already registered?{' '}
                <button
                  type="button"
                  onClick={onBackToLogin}
                  className="text-blue-500 hover:text-blue-600 font-medium"
                >
                  Back to Login
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
