import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signUp: (email: string, password: string, name?: string) => Promise<{ data: any; error: any }>
  signIn: (email: string, password: string) => Promise<{ data: any; error: any }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signUp: async () => ({ data: null, error: null }),
  signIn: async () => ({ data: null, error: null }),
  signOut: async () => {},
})

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch initial session
    const initSession = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        setSession(currentSession)
        setUser(currentSession?.user ?? null)
        if (currentSession?.access_token) {
          document.cookie = `sb-access-token=${currentSession.access_token}; path=/; max-age=604800; SameSite=Lax`
        }
      } catch (err) {
        console.error('Error getting auth session:', err)
      } finally {
        setLoading(false)
      }
    }

    initSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
      setUser(currentSession?.user ?? null)
      setLoading(false)

      if (currentSession?.access_token) {
        document.cookie = `sb-access-token=${currentSession.access_token}; path=/; max-age=604800; SameSite=Lax`
      } else {
        document.cookie = 'sb-access-token=; path=/; max-age=0'
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const signUp = async (email: string, password: string, name?: string) => {
    const res = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name || '',
        },
      },
    })
    if (res.data?.session) {
      setSession(res.data.session)
      setUser(res.data.session.user)
      if (typeof window !== 'undefined') {
        document.cookie = `sb-access-token=${res.data.session.access_token}; path=/; max-age=604800; SameSite=Lax`
      }
    }
    return res
  }

  const signIn = async (email: string, password: string) => {
    const res = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (res.data?.session) {
      setSession(res.data.session)
      setUser(res.data.session.user)
      if (typeof window !== 'undefined') {
        document.cookie = `sb-access-token=${res.data.session.access_token}; path=/; max-age=604800; SameSite=Lax`
      }
    }
    return res
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setUser(null)
    document.cookie = 'sb-access-token=; path=/; max-age=0'
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
