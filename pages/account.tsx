import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '@/lib/AuthContext'
import { AccountMenu } from '@/components/AccountMenu'

interface ProviderKeyStatus {
  configured: boolean
  key_last4: string | null
  source: 'personal' | 'env' | 'none'
}

interface ProviderCardProps {
  id: string
  name: string
  description: string
  status: ProviderKeyStatus
  onOpenModal: (providerId: string, providerName: string) => void
  onRemoveKey: (providerId: string, providerName: string) => void
  loading: boolean
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
    description: 'Powers ultra-fast Llama 3.3 70B chat inference & HyDE expansion',
    signupUrl: 'https://console.groq.com',
  },
  {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    description: 'Powers GPT-4o mini chat generation & text-embedding-3-small',
    signupUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'cohere',
    name: 'Cohere',
    description: 'Powers Cohere Command-A chat & embed-english-v3.0 embeddings',
    signupUrl: 'https://dashboard.cohere.com',
  },
]

export default function AccountPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [providerKeys, setProviderKeys] = useState<Record<string, ProviderKeyStatus>>({})
  const [fetching, setFetching] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [modalProvider, setModalProvider] = useState<{ id: string; name: string } | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/account')
    }
  }, [user, authLoading, router])

  const fetchUserStatus = async () => {
    try {
      setFetching(true)
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
      console.error('Failed to fetch user status:', err)
    } finally {
      setFetching(false)
    }
  }

  useEffect(() => {
    if (user) {
      fetchUserStatus()
    }
  }, [user])

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!modalProvider || !apiKeyInput.trim()) return

    setModalError(null)
    setActionLoading(modalProvider.id)

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
          provider: modalProvider.id,
          apiKey: apiKeyInput.trim(),
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        setModalError(json.error || 'Failed to save key')
      } else {
        setSaveSuccess(`Successfully saved ${modalProvider.name} API key!`)
        setTimeout(() => setSaveSuccess(null), 4000)
        setModalProvider(null)
        setApiKeyInput('')
        fetchUserStatus()
      }
    } catch (err: any) {
      setModalError(err.message || 'An error occurred')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRemoveKey = async (providerId: string, providerName: string) => {
    if (!confirm(`Are you sure you want to remove your personal ${providerName} API key? VectorMind will fall back to system default keys.`)) {
      return
    }

    setActionLoading(providerId)
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
        setSaveSuccess(`Removed personal ${providerName} key.`)
        setTimeout(() => setSaveSuccess(null), 4000)
        fetchUserStatus()
      }
    } catch (err) {
      console.error('Failed to remove key:', err)
    } finally {
      setActionLoading(null)
    }
  }

  if (authLoading || (!user && fetching)) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-400">Loading account portal...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      <Head>
        <title>Account & API Keys — VectorMind</title>
      </Head>

      {/* Header Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/app" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform duration-300">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
            <span className="text-xl font-extrabold bg-gradient-to-r from-white via-slate-200 to-emerald-400 bg-clip-text text-transparent tracking-tight">
              VectorMind
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/app"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-900"
            >
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Workspaces
            </Link>
            <AccountMenu />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Banner Alert */}
        {saveSuccess && (
          <div className="mb-8 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-3 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
            <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">{saveSuccess}</span>
          </div>
        )}

        {/* User Profile Card */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/30 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl mb-10 relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-xl shadow-emerald-500/20 shrink-0">
                <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-2xl font-black text-emerald-400">
                  {user?.email ? user.email.charAt(0).toUpperCase() : 'U'}
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight">Account & Personal Keys</h1>
                <p className="text-sm text-slate-400 mt-1">{user?.email}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                    Encrypted Key Storage Active
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Provider Keys Grid */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">AI Provider API Keys</h2>
              <p className="text-sm text-slate-400">Configure your personal API keys for Gemini, Groq, OpenAI, and Cohere.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PROVIDERS.map((provider) => {
              const status = providerKeys[provider.id] || { configured: false, key_last4: null, source: 'none' }
              return (
                <div
                  key={provider.id}
                  className="bg-slate-900/70 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-6 transition-all shadow-lg flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center font-bold text-emerald-400">
                          {provider.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-base">{provider.name}</h3>
                          <a
                            href={provider.signupUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                          >
                            Get API Key
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </div>
                      </div>

                      {status.source === 'personal' ? (
                        <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          Personal Key
                        </span>
                      ) : status.source === 'env' ? (
                        <span className="px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-semibold flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-teal-400" />
                          System Default
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-xs font-semibold flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-slate-500" />
                          Not Configured
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 mb-4">{provider.description}</p>

                    {status.source === 'personal' && status.key_last4 && (
                      <div className="mb-4 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 font-mono flex items-center justify-between">
                        <span className="text-slate-400">Key ending:</span>
                        <span className="text-emerald-400 font-bold">•••• •••• •••• {status.key_last4}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 pt-3 border-t border-slate-800/60">
                    <button
                      onClick={() => {
                        setModalProvider({ id: provider.id, name: provider.name })
                        setApiKeyInput('')
                        setModalError(null)
                      }}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      {status.source === 'personal' ? 'Update Key' : 'Add Personal Key'}
                    </button>

                    {status.source === 'personal' && (
                      <button
                        onClick={() => handleRemoveKey(provider.id, provider.name)}
                        disabled={actionLoading === provider.id}
                        className="py-2 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Security Box */}
        <div className="mt-12 p-6 rounded-3xl bg-slate-900/50 border border-slate-800 text-xs text-slate-400 space-y-2">
          <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Security & Key Storage Guarantee
          </h4>
          <p>
            Your API keys are encrypted at rest using AES-256-GCM symmetric encryption using a server-side encryption key. Raw keys are never sent to the browser after saving, and are decrypted strictly on the backend when executing authorized requests.
          </p>
        </div>
      </main>

      {/* Modal for adding/updating key */}
      {modalProvider && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-white">
                Add {modalProvider.name} Key
              </h3>
              <button
                onClick={() => setModalProvider(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {modalError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveKey} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  API Key String
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    required
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Paste your key here..."
                    className="w-full px-4 py-2.5 pr-10 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                  >
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalProvider(null)}
                  className="py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === modalProvider.id || !apiKeyInput.trim()}
                  className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
                >
                  {actionLoading === modalProvider.id ? 'Encrypting & Saving...' : 'Save Encrypted Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
