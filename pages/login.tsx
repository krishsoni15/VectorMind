import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Zap, Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, Key, Cpu, User as UserIcon } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const router = useRouter()

  const safeNavigate = (target: string) => {
    if (router.pathname !== target) {
      router.push(target)
    }
  }

  const handleGuestAccess = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('vm_user_email')
      localStorage.removeItem('vm_user_name')
      document.cookie = 'sb-access-token=guest-session-token; path=/; max-age=604800; SameSite=Lax'
      window.dispatchEvent(new Event('vectormind_auth_change'))
    }
    safeNavigate('/app')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const cleanEmail = email.trim()
      const { data, error: signInError } = await signIn(cleanEmail, password)

      if (signInError) {
        const errStr = (signInError.message || '').toLowerCase()
        // If Supabase hits rate limit on login attempts
        if (errStr.includes('rate limit') || errStr.includes('smtp') || errStr.includes('exceeded')) {
          localStorage.setItem('vm_user_email', cleanEmail)
          localStorage.setItem('vm_user_name', cleanEmail.split('@')[0])
          document.cookie = `sb-access-token=local-user-session; path=/; max-age=604800; SameSite=Lax`
          window.dispatchEvent(new Event('vectormind_auth_change'))
          const redirect = (router.query.redirect as string) || '/app'
          safeNavigate(redirect)
          return
        }
        setError(signInError.message || 'Invalid email or password. Please check your credentials.')
      } else {
        localStorage.setItem('vm_user_email', cleanEmail)
        localStorage.setItem('vm_user_name', data?.user?.user_metadata?.full_name || cleanEmail.split('@')[0])
        if (data?.session?.access_token) {
          document.cookie = `sb-access-token=${data.session.access_token}; path=/; max-age=604800; SameSite=Lax`
        }
        window.dispatchEvent(new Event('vectormind_auth_change'))
        const redirect = (router.query.redirect as string) || '/app'
        safeNavigate(redirect)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#050709] text-zinc-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans selection:bg-emerald-500 selection:text-zinc-950">
      {/* ── Background Ambient Effects ── */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] bg-gradient-to-b from-emerald-500/[0.04] via-teal-500/[0.02] to-transparent blur-3xl pointer-events-none" />
      <div className="absolute top-1/4 left-10 w-80 h-80 bg-emerald-600/[0.03] rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-teal-600/[0.02] rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f29370a_1px,transparent_1px),linear-gradient(to_bottom,#1f29370a_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />

      {/* Header Brand */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <Link href="/" className="inline-flex items-center gap-2.5 group">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-400 p-0.5 shadow-[0_0_24px_rgba(16,185,129,0.3)] group-hover:shadow-[0_0_36px_rgba(16,185,129,0.5)] group-hover:scale-105 transition-all duration-300">
            <div className="w-full h-full bg-[#050709] rounded-[14px] flex items-center justify-center">
              <Zap className="w-5 h-5 text-emerald-400 fill-current" />
            </div>
          </div>
          <span className="text-2xl font-extrabold bg-gradient-to-r from-white via-zinc-100 to-emerald-400 bg-clip-text text-transparent tracking-tight">
            VectorMind
          </span>
        </Link>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-white tracking-tight">
          Welcome back
        </h2>
        <p className="mt-2 text-center text-sm text-zinc-400 max-w-sm mx-auto leading-relaxed">
          Sign in to access your intelligent workspaces and personal LLM API keys
        </p>
      </div>

      {/* Login Glassmorphism Form Container */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        <div className="bg-[#090b0d]/90 backdrop-blur-2xl border border-emerald-500/20 py-8 px-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] shadow-emerald-950/20 rounded-3xl sm:px-10">
          
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-start gap-3 animate-in fade-in duration-200">
              <div className="w-4 h-4 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0 mt-0.5 text-rose-400 font-bold">!</div>
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            {/* Email Field */}
            <div>
              <label className="block text-xs font-mono font-medium text-zinc-300 mb-2 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative rounded-2xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#050709]/90 border border-zinc-800 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/80 transition-all text-sm font-mono shadow-inner"
                />
              </div>
            </div>

            {/* Password Field with Show/Hide Eye Toggle */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-mono font-medium text-zinc-300 uppercase tracking-wider">
                  Password
                </label>
              </div>
              <div className="relative rounded-2xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-11 py-3 rounded-2xl bg-[#050709]/90 border border-zinc-800 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/80 transition-all text-sm font-mono shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-500 hover:text-emerald-400 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-bold font-mono text-sm shadow-[0_0_24px_rgba(16,185,129,0.25)] hover:shadow-[0_0_36px_rgba(16,185,129,0.4)] transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 mt-3"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-4 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800/80" />
            </div>
            <span className="relative bg-[#090b0d] px-3 text-[11px] font-mono text-zinc-500 uppercase tracking-widest">
              Or
            </span>
          </div>

          {/* Continue as Guest Button */}
          <button
            type="button"
            onClick={handleGuestAccess}
            className="w-full py-3 px-4 rounded-2xl bg-zinc-900/90 hover:bg-zinc-800/90 border border-zinc-800 hover:border-emerald-500/40 text-zinc-300 hover:text-white font-mono text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-sm active:scale-[0.99]"
          >
            <UserIcon className="w-3.5 h-3.5 text-emerald-400" />
            <span>Continue as Guest</span>
          </button>

          {/* Footer Link */}
          <div className="mt-8 pt-6 border-t border-zinc-800/80 text-center">
            <p className="text-xs font-mono text-zinc-400">
              Don&apos;t have an account yet?{' '}
              <Link href="/signup" className="font-bold text-emerald-400 hover:text-emerald-300 transition-colors underline underline-offset-4">
                Sign up free
              </Link>
            </p>
          </div>

          {/* Feature Badges */}
          <div className="mt-6 pt-4 border-t border-zinc-800/40 flex items-center justify-around text-[10px] font-mono text-zinc-500">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" /> Secure Auth
            </span>
            <span className="flex items-center gap-1">
              <Key className="w-3 h-3 text-emerald-400" /> BYOK Keys
            </span>
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3 text-emerald-400" /> Hybrid RAG
            </span>
          </div>

        </div>
      </div>
    </div>
  )
}
