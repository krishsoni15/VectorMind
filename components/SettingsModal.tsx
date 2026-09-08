import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/AuthContext'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

interface ProviderKeyStatus {
  configured: boolean
  key_last4: string | null
  source: 'personal' | 'env' | 'none'
}

const PROVIDERS = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Powers Gemini 2.5 Flash chat generation & 3072-dim embeddings',
    signupUrl: 'https://ai.google.dev',
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Powers high-speed Llama 3 compound-mini chat & HyDE expansion',
    signupUrl: 'https://console.groq.com',
  },
  {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    description: 'Powers GPT-4o mini chat & text-embedding-3-small',
    signupUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'cohere',
    name: 'Cohere',
    description: 'Powers Cohere Command-A & embed-english-v3.0 embeddings',
    signupUrl: 'https://dashboard.cohere.com',
  },
]

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, signOut } = useAuth()
  const [localEmail, setLocalEmail] = useState<string | null>(null)
  const [localName, setLocalName] = useState<string | null>(null)
  const [providerKeys, setProviderKeys] = useState<Record<string, ProviderKeyStatus>>({})
  const [loading, setLoading] = useState(false)
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      setLocalEmail(localStorage.getItem('vm_user_email'))
      setLocalName(localStorage.getItem('vm_user_name'))
    }
  }, [isOpen])

  const activeEmail = user?.email || localEmail
  const activeName = user?.user_metadata?.full_name || localName || activeEmail

  const fetchStatus = async () => {
    if (!activeEmail) return
    try {
      setLoading(true)
      const { supabase } = await import('@/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      let token = session?.access_token
      if (!token && typeof document !== 'undefined') {
        const match = document.cookie.match(/sb-access-token=([^;]+)/)
        if (match) token = match[1]
      }

      const res = await fetch('/api/auth/user', {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      })

      if (res.ok) {
        const json = await res.json()
        setProviderKeys(json.providerKeys || {})
      }
    } catch (err) {
      console.error('Failed to fetch provider status:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && activeEmail) {
      fetchStatus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeEmail])

  if (!isOpen) return null

  const handleSaveKey = async (providerId: string, providerName: string) => {
    const rawKey = keyInputs[providerId]
    if (!rawKey || !rawKey.trim()) return

    setActionLoading(providerId)
    setMessage(null)

    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      let token = session?.access_token
      if (!token && typeof document !== 'undefined') {
        const match = document.cookie.match(/sb-access-token=([^;]+)/)
        if (match) token = match[1]
      }

      const res = await fetch('/api/auth/provider-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          provider: providerId,
          apiKey: rawKey.trim(),
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        setMessage({ text: json.error || 'Failed to save key', type: 'error' })
      } else {
        setMessage({ text: `Saved personal ${providerName} API key!`, type: 'success' })
        setKeyInputs((prev) => ({ ...prev, [providerId]: '' }))
        fetchStatus()
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Error saving key', type: 'error' })
    } finally {
      setActionLoading(null)
    }
  }

  const handleRemoveKey = async (providerId: string, providerName: string) => {
    if (!confirm(`Are you sure you want to remove your personal ${providerName} API key? VectorMind will fall back to system default keys.`)) {
      return
    }

    setActionLoading(providerId)
    setMessage(null)

    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      let token = session?.access_token
      if (!token && typeof document !== 'undefined') {
        const match = document.cookie.match(/sb-access-token=([^;]+)/)
        if (match) token = match[1]
      }

      const res = await fetch('/api/auth/provider-keys', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ provider: providerId }),
      })

      if (res.ok) {
        setMessage({ text: `Removed personal ${providerName} key.`, type: 'success' })
        fetchStatus()
      }
    } catch (err) {
      setMessage({ text: 'Failed to remove key', type: 'error' })
    } finally {
      setActionLoading(null)
    }
  }

  const handleSignOutUser = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('vm_user_email')
      localStorage.removeItem('vm_user_name')
      document.cookie = 'sb-access-token=; path=/; max-age=0'
    }
    setLocalEmail(null)
    setLocalName(null)
    await signOut()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-3xl p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white tracking-tight">Settings & Personal API Keys</h2>
              <p className="text-xs text-slate-400">Configure your personal AI provider credentials</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto py-6 space-y-6 custom-scrollbar pr-1">
          {/* Notification Message */}
          {message && (
            <div
              className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2.5 ${
                message.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${message.type === 'success' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              <span>{message.text}</span>
            </div>
          )}

          {/* Account Status Card */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-0.5">Account Status</p>
              {activeEmail ? (
                <div>
                  <p className="text-sm font-bold text-white">{activeEmail}</p>
                  {activeName && activeName !== activeEmail && (
                    <p className="text-xs text-emerald-400 font-semibold">{activeName}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5">Personal keys are securely bound to your user workspace</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-bold text-amber-300">Not Signed In</p>
                  <p className="text-xs text-slate-400 mt-0.5">Sign in or create an account to save personal API keys</p>
                </div>
              )}
            </div>

            {activeEmail ? (
              <button
                onClick={handleSignOutUser}
                className="py-2 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold transition-all shrink-0"
              >
                Sign Out
              </button>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href="/login"
                  onClick={onClose}
                  className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  onClick={onClose}
                  className="py-2 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 text-xs font-bold transition-all shadow-md shadow-emerald-500/20"
                >
                  Sign Up Free
                </Link>
              </div>
            )}
          </div>

          {/* Providers List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">AI Providers</h3>
              <span className="text-xs text-slate-400">Personal keys take priority over system defaults</span>
            </div>

            {PROVIDERS.map((provider) => {
              const status = providerKeys[provider.id] || { configured: false, key_last4: null, source: 'none' }
              const inputValue = keyInputs[provider.id] || ''
              const showKey = !!showKeys[provider.id]

              return (
                <div
                  key={provider.id}
                  className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-4 space-y-3 transition-all hover:border-slate-700/80"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-xs">
                        {provider.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">{provider.name}</h4>
                        <p className="text-xs text-slate-400">{provider.description}</p>
                      </div>
                    </div>

                    <div>
                      {status.source === 'personal' ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Personal Key ({status.key_last4 ? `••••${status.key_last4}` : 'Active'})
                        </span>
                      ) : status.source === 'env' ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-[11px] font-semibold inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                          System Default
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-[11px] font-semibold inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                          Not Configured
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Input & Action */}
                  <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                    <div className="relative flex-1 w-full">
                      <input
                        type={showKey ? 'text' : 'password'}
                        name={`vm_provider_key_${provider.id}`}
                        id={`vm_provider_key_${provider.id}`}
                        autoComplete="new-password"
                        autoCorrect="off"
                        spellCheck={false}
                        data-lpignore="true"
                        data-1p-ignore="true"
                        value={inputValue}
                        onChange={(e) =>
                          setKeyInputs((prev) => ({ ...prev, [provider.id]: e.target.value }))
                        }
                        placeholder={
                          status.source === 'personal'
                            ? '•••••••••••••••• (Enter new key to update)'
                            : `Enter your ${provider.name} API Key`
                        }
                        className="w-full px-3.5 py-2 pr-10 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-mono placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowKeys((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))
                        }
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-[10px] font-semibold uppercase tracking-wider"
                      >
                        {showKey ? 'Hide' : 'Show'}
                      </button>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                      <button
                        type="button"
                        disabled={!inputValue.trim() || actionLoading === provider.id || !activeEmail}
                        onClick={() => handleSaveKey(provider.id, provider.name)}
                        className="flex-1 sm:flex-none py-2 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition-all disabled:opacity-40 disabled:pointer-events-none"
                      >
                        {actionLoading === provider.id ? 'Saving...' : 'Save Key'}
                      </button>

                      {status.source === 'personal' && (
                        <button
                          type="button"
                          disabled={actionLoading === provider.id}
                          onClick={() => handleRemoveKey(provider.id, provider.name)}
                          className="py-2 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-all disabled:opacity-40"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
