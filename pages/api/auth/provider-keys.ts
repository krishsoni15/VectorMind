import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerUser, getAdminSupabase } from '@/lib/supabase'
import { encrypt } from '@/lib/encryption'
import { AIProvider } from '@/lib/credentialResolver'

const VALID_PROVIDERS: AIProvider[] = ['gemini', 'openai', 'groq', 'cohere']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getServerUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const supabase = getAdminSupabase()

  // 1. GET: Fetch list of personal configured keys metadata
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('user_provider_keys')
        .select('provider, key_last4, created_at, updated_at')
        .eq('user_id', user.id)

      if (error) {
        throw error
      }

      return res.status(200).json({ keys: data || [] })
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to fetch provider keys' })
    }
  }

  // 2. POST: Save or update personal API key
  if (req.method === 'POST') {
    try {
      const { provider, apiKey } = req.body

      if (!provider || !VALID_PROVIDERS.includes(provider as AIProvider)) {
        return res.status(400).json({ error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` })
      }

      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return res.status(400).json({ error: 'API key string is required' })
      }

      const trimmedKey = apiKey.trim()
      const key_last4 = trimmedKey.length >= 4 ? trimmedKey.slice(-4) : trimmedKey
      const encrypted_api_key = encrypt(trimmedKey)

      const { data, error } = await supabase
        .from('user_provider_keys')
        .upsert(
          {
            user_id: user.id,
            provider: provider.toLowerCase(),
            encrypted_api_key,
            key_last4,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,provider' }
        )
        .select('provider, key_last4, updated_at')
        .single()

      if (error) {
        throw error
      }

      return res.status(200).json({
        success: true,
        message: `${provider.toUpperCase()} API key saved securely.`,
        key: data,
      })
    } catch (err: any) {
      console.error('Error saving provider key:', err)
      return res.status(500).json({ error: err.message || 'Failed to save provider key' })
    }
  }

  // 3. DELETE: Remove personal API key
  if (req.method === 'DELETE') {
    try {
      const { provider } = req.body || req.query

      if (!provider || !VALID_PROVIDERS.includes(provider as AIProvider)) {
        return res.status(400).json({ error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` })
      }

      const { error } = await supabase
        .from('user_provider_keys')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', (provider as string).toLowerCase())

      if (error) {
        throw error
      }

      return res.status(200).json({
        success: true,
        message: `${provider.toUpperCase()} API key removed.`,
      })
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to remove provider key' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
