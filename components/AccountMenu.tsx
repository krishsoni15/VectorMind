import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '@/lib/AuthContext'

interface AccountMenuProps {
  onOpenSettings?: () => void
}

export const AccountMenu: React.FC<AccountMenuProps> = ({ onOpenSettings }) => {
  const { user, signOut, loading } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [localEmail, setLocalEmail] = useState<string | null>(null)
  const [localName, setLocalName] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const syncUser = () => {
      if (typeof window !== 'undefined') {
        setLocalEmail(localStorage.getItem('vm_user_email'))
        setLocalName(localStorage.getItem('vm_user_name'))
      }
    }
    syncUser()
    
    window.addEventListener('storage', syncUser)
    const interval = setInterval(syncUser, 1000)
    return () => {
      window.removeEventListener('storage', syncUser)
      clearInterval(interval)
    }
  }, [router.pathname, user])

  if (loading) {
    return (
      <div className="w-9 h-9 rounded-full bg-white/10 animate-pulse border border-emerald-500/20" />
    )
  }

  const activeEmail = user?.email || localEmail
  const activeName = user?.user_metadata?.full_name || localName || activeEmail

  // If user is not signed in (neither via Supabase nor via local user session)
  if (!activeEmail) {
    if (router.pathname === '/app') {
      return (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 p-1.5 rounded-full bg-slate-900/80 border border-emerald-500/30 hover:border-emerald-400/60 transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            title="Guest Workspace Account"
            aria-label="Account Menu"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 via-teal-500 to-emerald-400 text-zinc-950 font-extrabold flex items-center justify-center text-xs shadow-inner">
              G
            </div>
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform duration-200 pr-1 ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-800 shadow-2xl shadow-emerald-950/40 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 font-sans">
              <div className="p-4 border-b border-slate-800 bg-slate-950/40">
                <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Guest Workspace</p>
                <p className="text-sm font-medium text-slate-200 truncate mt-0.5">
                  Local Session Active
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Free Workspace Session
                </div>
              </div>

              <div className="p-2 space-y-1">
                <Link
                  href="/login"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-xl transition-colors font-medium"
                >
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Sign In Account
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-3 py-2 text-sm text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-xl transition-colors font-medium"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  Create Free Account
                </Link>
              </div>
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="text-xs font-mono font-semibold text-zinc-300 hover:text-white transition-colors px-3.5 py-2 rounded-xl hover:bg-zinc-800/60 border border-transparent hover:border-zinc-700/60"
        >
          Sign In
        </Link>
        <Link
          href="/signup"
          className="text-xs font-mono font-bold text-zinc-950 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 px-4 py-2 rounded-xl shadow-md shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          Get Started
        </Link>
      </div>
    )
  }

  const displayInitial = (activeName || activeEmail || 'U').charAt(0).toUpperCase()

  const handleSignOut = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('vm_user_email')
      localStorage.removeItem('vm_user_name')
      document.cookie = 'sb-access-token=; path=/; max-age=0'
      window.dispatchEvent(new Event('vectormind_auth_change'))
    }
    setLocalEmail(null)
    setLocalName(null)
    await signOut()
    setIsOpen(false)
    router.push('/login')
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 rounded-full bg-slate-900/80 border border-emerald-500/30 hover:border-emerald-400/60 transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        title={activeEmail || 'Account'}
        aria-label="Account Menu"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 via-teal-500 to-emerald-400 text-zinc-950 font-bold flex items-center justify-center text-sm shadow-inner">
          {displayInitial}
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 pr-1 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-800 shadow-2xl shadow-emerald-950/40 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 font-sans">
          <div className="p-4 border-b border-slate-800 bg-slate-950/40">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Signed in as</p>
            <p className="text-sm font-medium text-slate-100 truncate mt-0.5" title={activeEmail}>
              {activeEmail}
            </p>
            {activeName && activeName !== activeEmail && (
              <p className="text-xs text-zinc-400 truncate mt-0.5">{activeName}</p>
            )}
            <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Active Session
            </div>
          </div>

          <div className="p-2 space-y-1">
            {router.pathname === '/app' ? (
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-xl transition-colors text-left font-medium"
              >
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                Workspaces Dashboard
              </button>
            ) : (
              <Link
                href="/app"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-xl transition-colors font-medium"
              >
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                Workspaces Dashboard
              </Link>
            )}

            {onOpenSettings ? (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  onOpenSettings()
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-xl transition-colors text-left font-medium"
              >
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                API Keys & Settings
              </button>
            ) : (
              <Link
                href="/account"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-xl transition-colors font-medium"
              >
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                API Keys & Settings
              </Link>
            )}
          </div>

          <div className="p-2 border-t border-slate-800/80 bg-slate-950/20">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
